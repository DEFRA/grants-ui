import { buildSkeleton, buildOverlay, buildColorExpr, addParcelsToMap, fitToParcels } from './helpers.js'
import { fetchParcelData } from './loader.js'
import { initMap } from './init.js'
import { attachTooltip } from './tooltip.js'
import { attachParcelLabels } from './labels.js'
import { attachSelectionRelay } from './selection.js'
import { attachResetButton } from './reset-button.js'
import { attachParcelSearch } from './search.js'
import { createParcelStore } from './store.js'
import {
  MULTI_SELECT_ATTRIBUTE,
  ENABLED_LAND_ACTIONS_ATTRIBUTE,
  LAYER_ID_FILL,
  PARCEL_ID_PROPERTY,
  SELECT_FEATURE_EVENT,
  SELECT_LISTENER_POLL_MS,
  SELECT_LISTENER_MAX_POLLS,
  MSG_ERROR_UNAVAILABLE,
  EVENT_READY,
  EVENT_ERROR,
  SELECTION_SOURCE_MAP,
  ERROR_REASON_UNAVAILABLE,
  ERROR_REASON_NO_PARCELS,
  STATE_IDLE,
  STATE_LOADING,
  STATE_READY,
  STATE_ERROR
} from './config.js'

/**
 * What every attached module (tooltip, labels, reset button, selection relay,
 * search) is handed once the map and the parcel data are ready.
 * @typedef {object} MapContext
 * @property {ParcelMap} host  the <parcel-map> element
 * @property {ReturnType<typeof initMap>['mapInstance']} mapInstance
 * @property {ReturnType<typeof initMap>['interactPlugin']} interactPlugin
 * @property {import('maplibre-gl').Map} ml
 * @property {HTMLDivElement | null} mapEl
 * @property {import('./store.js').ParcelStore} store
 * @property {Array<() => void>} cleanups  each module registers its own `off`s here
 * @property {boolean} multiSelect
 */

// <parcel-map multi-select="true|false">
// Lifecycle shell: owns the state machine and event dispatch, and delegates map
// bootstrap, data loading, tooltip, selection and search wiring to focused modules.
export class ParcelMap extends HTMLElement {
  /** @type {typeof STATE_IDLE | typeof STATE_LOADING | typeof STATE_READY | typeof STATE_ERROR} */
  #state = STATE_IDLE

  /** @type {ReturnType<typeof initMap>['mapInstance'] | null} */
  #mapInstance = null

  /** @type {ReturnType<typeof initMap>['interactPlugin'] | null} */
  #interactPlugin = null

  /** @type {import('maplibre-gl').Map | null} */
  #ml = null

  /** @type {import('./store.js').ParcelStore} */
  #store = createParcelStore()

  /** @type {HTMLDivElement | null} */
  #mapEl = null

  /** @type {HTMLElement | null} */
  #skeleton = null

  /** @type {HTMLDivElement | null} */
  #errorOverlay = null

  /** @type {Array<() => void>} */
  #mlCleanup = []

  /** @type {ReturnType<typeof attachSelectionRelay> | null} */
  #selectionRelay = null

  /** @type {ReturnType<typeof globalThis.setTimeout> | null} */
  #pendingSelect = null

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
    if (this.#pendingSelect !== null) {
      globalThis.clearTimeout(this.#pendingSelect)
      this.#pendingSelect = null
    }
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
    this.#ml = null
    this.#store = createParcelStore()
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
    const enabledLandActions = (this.getAttribute(ENABLED_LAND_ACTIONS_ATTRIBUTE) ?? '')
      .split(',')
      .map((action) => action.trim())
      .filter(Boolean)

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

    const [ml, data] = await Promise.all([ready, fetchParcelData(enabledLandActions)])

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
      Object.assign(this.#store, data)
      this.#ml = ml
      addParcelsToMap(ml, data, buildColorExpr(data.parcelIds))
      /** @type {MapContext} */
      const context = {
        host: this,
        mapInstance,
        interactPlugin,
        ml,
        mapEl: this.#mapEl,
        store: this.#store,
        cleanups: this.#mlCleanup,
        multiSelect
      }
      attachParcelLabels(context)
      const tooltip = attachTooltip(context)
      attachResetButton(context)
      this.#selectionRelay = attachSelectionRelay({ ...context, tooltip })
      attachParcelSearch(context)
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

  /**
   * Selects parcels as if the user had clicked them, so a selection the server
   * sent back (e.g. after a rejected submit) survives the re-render. `source`
   * is passed on in the selection event (see SELECTION_SOURCE_*).
   * @param {string[]} ids
   * @param {{ source?: string }} [options]
   */
  selectParcels(ids, { source = SELECTION_SOURCE_MAP } = {}) {
    if (this.#state !== STATE_READY) {
      return
    }
    const known = [...new Set(ids)].filter((id) => this.#store.metaIndex[id])
    const multiSelect = this.getAttribute(MULTI_SELECT_ATTRIBUTE) === 'true'
    // The plugin treats selecting a selected parcel as a toggle-off, so one the
    // user already has (e.g. picked again from the search box) is left as is.
    const toSelect = (multiSelect ? known : known.slice(0, 1)).filter((id) => !this.#selectionRelay?.isSelected(id))
    if (toSelect.length === 0) {
      return
    }

    this.#whenInteractListening((listening) => {
      for (const id of toSelect) {
        // Only a plugin that is listening answers with a selection change; an
        // armed source would otherwise tag the user's next map click.
        if (listening) {
          this.#selectionRelay?.setNextSource(source)
        }
        this.#mapInstance?.emit(SELECT_FEATURE_EVENT, {
          featureId: id,
          layerId: LAYER_ID_FILL,
          idProperty: PARCEL_ID_PROPERTY,
          properties: this.#store.metaIndex[id]
        })
      }
    })
  }

  /**
   * Runs `apply` once the interact plugin is listening for SELECT_FEATURE_EVENT,
   * or with `false` once the wait runs out.
   * @param {(listening: boolean) => void} apply
   */
  #whenInteractListening(apply) {
    const isListening = () => {
      const bus = /** @type {{ eventBus?: { events?: Record<string, unknown[]> } } | null} */ (this.#mapInstance)
        ?.eventBus
      return (bus?.events?.[SELECT_FEATURE_EVENT]?.length ?? 0) > 0
    }

    let polls = 0
    const poll = () => {
      this.#pendingSelect = null
      if (this.#state !== STATE_READY) {
        return
      }
      polls += 1
      const listening = isListening()
      if (listening || polls >= SELECT_LISTENER_MAX_POLLS) {
        apply(listening)
        return
      }
      this.#pendingSelect = globalThis.setTimeout(poll, SELECT_LISTENER_POLL_MS)
    }
    poll()
  }

  // Re-fits the viewport to every selectable parcel, undoing any pan/zoom.
  focusParcels() {
    fitToParcels(this.#ml, this.#store.bbox)
  }
}
