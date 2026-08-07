import { buildSkeleton, buildOverlay, buildColorExpr, addParcelsToMap } from './map-helpers.js'
import { fetchParcelData } from './parcel-map-loader.js'
import { initMap } from './parcel-map-init.js'
import { attachTooltip } from './parcel-map-tooltip.js'
import { attachSelectionRelay } from './parcel-map-selection.js'
import {
  MULTI_SELECT_ATTRIBUTE,
  MSG_ERROR_UNAVAILABLE,
  EVENT_READY,
  EVENT_ERROR,
  ERROR_REASON_UNAVAILABLE,
  ERROR_REASON_NO_PARCELS,
  STATE_IDLE,
  STATE_LOADING,
  STATE_READY,
  STATE_ERROR
} from './config.js'

// <parcel-map multi-select="true|false">
// Lifecycle shell: owns the state machine and event dispatch, and delegates map
// bootstrap, data loading, tooltip and selection wiring to focused modules.
export class ParcelMap extends HTMLElement {
  /** @type {typeof STATE_IDLE | typeof STATE_LOADING | typeof STATE_READY | typeof STATE_ERROR} */
  #state = STATE_IDLE

  /** @type {ReturnType<typeof initMap>['mapInstance'] | null} */
  #mapInstance = null

  /** @type {ReturnType<typeof initMap>['interactPlugin'] | null} */
  #interactPlugin = null

  /** @type {HTMLDivElement | null} */
  #mapEl = null

  /** @type {HTMLElement | null} */
  #skeleton = null

  /** @type {HTMLDivElement | null} */
  #errorOverlay = null

  /** @type {Array<() => void>} */
  #mlCleanup = []

  /** @type {{ allowNextClear: () => void } | null} */
  #selectionRelay = null

  // customElements.define() upgrades an already-parsed <parcel-map> the instant
  // it registers, so connectedCallback() can run — and, once its data fetch
  // resolves, dispatch EVENT_READY/EVENT_ERROR — before a later <script type="module">
  // (e.g. parcel-select-page.js) has attached its listeners. Recording the last
  // terminal event here lets #replayLastEvent() catch such a listener up.
  /** @type {CustomEvent | null} */
  #lastEvent = null

  connectedCallback() {
    this.#state = STATE_IDLE
    this.#lastEvent = null
    this.#init()
  }

  disconnectedCallback() {
    this.#teardown()
  }

  #teardown() {
    this.#state = STATE_IDLE
    for (const off of this.#mlCleanup) {
      off()
    }
    this.#mlCleanup = []
    try {
      this.#mapInstance?.destroy?.()
    } catch {
      /* ignore */
    }
    this.#mapInstance = null
    this.#interactPlugin = null
    this.#selectionRelay = null
    this.#mapEl?.parentElement?.remove()
    this.#mapEl = null
    this.#skeleton?.remove()
    this.#skeleton = null
    this.#errorOverlay?.remove()
    this.#errorOverlay = null
  }

  async #init() {
    this.#state = STATE_LOADING

    const multiSelect = this.getAttribute(MULTI_SELECT_ATTRIBUTE) === 'true'

    this.#skeleton = buildSkeleton()
    this.appendChild(this.#skeleton)

    const { mapEl, mapInstance, interactPlugin, ready } = initMap(this, {
      multiSelect,
      skeleton: this.#skeleton,
      isLoading: () => this.#state === STATE_LOADING,
      cleanups: this.#mlCleanup
    })
    this.#mapEl = mapEl
    this.#mapInstance = mapInstance
    this.#interactPlugin = interactPlugin

    const [ml, data] = await Promise.all([ready, fetchParcelData()])

    // Torn down (disconnected) while we were loading, nothing to wire up.
    if (this.#state !== STATE_LOADING) {
      return
    }

    if (!ml || !data) {
      this.#teardown()
      this.#state = STATE_ERROR
      this.#showError(MSG_ERROR_UNAVAILABLE)
      this.#dispatchTerminal(EVENT_ERROR, { reason: ERROR_REASON_UNAVAILABLE })
    } else if (data.parcelIds.length === 0) {
      this.#teardown()
      this.#state = STATE_ERROR
      this.#dispatchTerminal(EVENT_ERROR, { reason: ERROR_REASON_NO_PARCELS })
    } else {
      const colorExpr = buildColorExpr(data.parcelIds)
      addParcelsToMap(ml, data, colorExpr)
      const tooltip = attachTooltip(ml, data.metaIndex, this.#mapEl, this.#mlCleanup)
      this.#selectionRelay = attachSelectionRelay({
        host: this,
        mapInstance: this.#mapInstance,
        ml,
        tooltip,
        cleanups: this.#mlCleanup,
        multiSelect
      })
      this.#interactPlugin?.enable()

      this.#state = STATE_READY
      this.#skeleton?.remove()
      this.#skeleton = null

      this.#dispatchTerminal(EVENT_READY, { parcelIds: data.parcelIds, metaIndex: data.metaIndex })
    }
  }

  /** @param {string} message */
  #showError(message) {
    this.#errorOverlay = buildOverlay(message, { role: 'alert' })
    this.appendChild(this.#errorOverlay)
  }

  /**
   * @param {string} type
   * @param {unknown} detail
   */
  #dispatchTerminal(type, detail) {
    const event = new CustomEvent(type, { bubbles: true, detail })
    this.#lastEvent = event
    this.dispatchEvent(event)
  }

  /**
   * Returns the last EVENT_READY/EVENT_ERROR this element dispatched, or null
   * if it hasn't reached a terminal state yet. Lets a listener attached after
   * that event already fired (see #lastEvent above) catch up synchronously.
   * @param {string} type
   * @returns {CustomEvent | null}
   */
  getLastEvent(type) {
    return this.#lastEvent?.type === type ? this.#lastEvent : null
  }

  // Deselects every selected parcel
  clearSelection() {
    this.#selectionRelay?.allowNextClear()
    this.#interactPlugin?.clear()
  }
}
