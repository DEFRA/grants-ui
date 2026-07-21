import { buildSkeleton, buildOverlay, buildColorExpr, addParcelsToMap } from './map-helpers.js'
import { fetchParcelData } from './parcel-map-loader.js'
import { initMap } from './parcel-map-init.js'
import { attachTooltip } from './parcel-map-tooltip.js'
import { attachSelectionRelay } from './parcel-map-selection.js'
import {
  DEFAULT_BASEMAP_PROVIDER,
  BASEMAP_PROVIDER_ATTRIBUTE,
  BASEMAP_METRICS_ATTRIBUTE,
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

/**
 * @import { Map as MLMap } from 'maplibre-gl'
 */

// <parcel-map multi-select="true|false" basemap-provider="ordnance-survey|openstreetmap" basemap-metrics="true|false">
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

  #connected = false

  #pendingReinit = false

  static get observedAttributes() {
    return [BASEMAP_PROVIDER_ATTRIBUTE]
  }

  connectedCallback() {
    this.#connected = true
    this.#state = STATE_IDLE
    this.#init()
  }

  disconnectedCallback() {
    this.#connected = false
    this.#teardown()
  }

  /** @param {string} name */
  attributeChangedCallback(name) {
    // Ignore the attribute's own initial set before the element is connected.
    if (name !== BASEMAP_PROVIDER_ATTRIBUTE || !this.#connected) {
      return
    }
    if (this.#state === STATE_LOADING) {
      this.#pendingReinit = true
      return
    }
    this.#teardown()
    this.#state = STATE_IDLE
    this.#init()
  }

  #teardown() {
    this.#state = STATE_IDLE
    this.#pendingReinit = false
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
    this.#mapEl?.parentElement?.remove()
    this.#mapEl = null
    this.#skeleton?.remove()
    this.#skeleton = null
    this.#errorOverlay?.remove()
    this.#errorOverlay = null
  }

  async #init() {
    this.#state = STATE_LOADING

    // Read once per init — basemap-provider changes trigger a fresh #init via
    // attributeChangedCallback, so this always reflects the current value.
    const multiSelect = this.getAttribute(MULTI_SELECT_ATTRIBUTE) === 'true'
    const basemapProvider = this.getAttribute(BASEMAP_PROVIDER_ATTRIBUTE) || DEFAULT_BASEMAP_PROVIDER

    this.#skeleton = buildSkeleton()
    this.appendChild(this.#skeleton)

    const { mapEl, mapInstance, interactPlugin, ready } = initMap(this, {
      multiSelect,
      basemapProvider,
      skeleton: this.#skeleton,
      wantMetrics: this.getAttribute(BASEMAP_METRICS_ATTRIBUTE) === 'true',
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
      this.dispatchEvent(new CustomEvent(EVENT_ERROR, { bubbles: true, detail: { reason: ERROR_REASON_UNAVAILABLE } }))
    } else if (data.parcelIds.length === 0) {
      this.#teardown()
      this.#state = STATE_ERROR
      this.dispatchEvent(new CustomEvent(EVENT_ERROR, { bubbles: true, detail: { reason: ERROR_REASON_NO_PARCELS } }))
    } else {
      const colorExpr = buildColorExpr(data.parcelIds)
      addParcelsToMap(ml, data, colorExpr, basemapProvider)
      const tooltip = attachTooltip(ml, data.metaIndex, this.#mapEl, this.#mlCleanup)
      attachSelectionRelay({ host: this, mapInstance: this.#mapInstance, ml, tooltip, cleanups: this.#mlCleanup })
      this.#interactPlugin?.enable()

      this.#state = STATE_READY
      this.#skeleton?.remove()
      this.#skeleton = null

      this.dispatchEvent(new CustomEvent(EVENT_READY, { bubbles: true }))
    }

    if (this.#pendingReinit) {
      this.#pendingReinit = false
      this.#teardown()
      this.#state = STATE_IDLE
      this.#init()
    }
  }

  /** @param {string} message */
  #showError(message) {
    this.#errorOverlay = buildOverlay(message, { role: 'alert' })
    this.appendChild(this.#errorOverlay)
  }
}
