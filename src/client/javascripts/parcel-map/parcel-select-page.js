// Page-level wiring for the land-parcel selection form. Consumes the three
// public events emitted by <parcel-map> and drives this journey's form DOM
// (hidden inputs, map/list views, selected parcel details, live summary).
import {
  ENABLED_LAND_ACTIONS_ATTRIBUTE,
  DEFER_LOADING_ATTRIBUTE,
  EVENT_ERROR,
  EVENT_READY,
  EVENT_SELECTION,
  PARCEL_DETAILS_REQUEST_TIMEOUT_MS,
  TOTAL_AREA_DECIMAL_PLACES
} from './config.js'
import { formatParcelReference } from '../../../shared/format-parcel.js'
import { initParcelViewToggle, restoreParcelViewSelection } from './parcel-view-toggle.js'
import { createParcelListDetailsRenderer, renderRequirementItems, requirementsText } from './parcel-list-details.js'

// DOM ids this script expects map-select-parcel.html to provide.
const DOM_ID_PARCEL_MAP = 'parcel-map'
const DOM_ID_PARCEL_MAP_TOTAL_COUNT = 'parcel-map-total-count'
const DOM_ID_PARCEL_MAP_TOTAL_AREA = 'parcel-map-total-area'
const DOM_ID_CONTINUE = 'map-select-continue'
const DOM_ID_SELECTED_PARCEL_DETAILS = 'selected-parcel-details'
const DOM_ID_SELECTED_PARCEL_REFERENCE = 'selected-parcel-reference'
const DOM_ID_SELECTED_PARCEL_AREA = 'selected-parcel-area'
const DOM_ID_SELECTED_PARCEL_ACTIONS = 'selected-parcel-actions'
const DOM_ID_SELECTED_PARCEL_ACTIONS_ROW = 'selected-parcel-actions-row'
const DOM_ID_SUMMARY_PARCEL_NO_ACTIONS = 'summary-parcel-no-actions'
const DOM_ID_SELECTED_PARCEL_CHANGE = 'selected-parcel-change'
const DOM_ID_SELECTED_PARCELS_INPUTS = 'selected-parcels-inputs'
const DOM_ID_REQUIREMENTS_ROW = 'selected-parcel-requirements-row'
const DOM_ID_REQUIREMENTS_INTRO = 'selected-parcel-requirements-intro'
const DOM_ID_REQUIREMENTS_LIST = 'selected-parcel-requirements-list'
const DOM_ID_REQUIREMENTS_STATUS = 'selected-parcel-requirements-status'
const DATASET_SELECTED_PARCELS = 'selectedParcels'

/** @param {string} id */
const unhide = (id) => {
  const el = document.getElementById(id)
  if (el) {
    el.hidden = false
  }
}

/**
 * @param {string} id
 * @param {string} text
 */
const setText = (id, text) => {
  const el = document.getElementById(id)
  if (el) {
    el.textContent = text
  }
}

/**
 * @param {import('./map-helpers.js').MetaIndex} metaIndex
 * @param {string[]} parcelIds
 */
const updateMapTotals = (metaIndex, parcelIds) => {
  const totalArea = parcelIds.reduce((sum, id) => sum + (Number(metaIndex[id]?.areaHa) || 0), 0)
  setText(DOM_ID_PARCEL_MAP_TOTAL_COUNT, String(parcelIds.length))
  setText(DOM_ID_PARCEL_MAP_TOTAL_AREA, totalArea.toFixed(TOTAL_AREA_DECIMAL_PLACES))
}

/**
 * @param {SelectedParcel[]} selectedParcels
 * @param {import('./map-helpers.js').MetaIndex} [metaIndex]
 */
const renderSelectedParcelDetails = (selectedParcels, metaIndex = {}) => {
  const details = document.getElementById(DOM_ID_SELECTED_PARCEL_DETAILS)
  if (!details) {
    return
  }
  const noActions = document.getElementById(DOM_ID_SUMMARY_PARCEL_NO_ACTIONS)
  if (selectedParcels.length !== 1) {
    details.hidden = true
    if (noActions) {
      noActions.hidden = true
    }
    return
  }
  const [{ id }] = selectedParcels
  // The clicked feature comes from the vector tile, which carries only
  // id/sheet_id/parcel_id — area and action count come from the parcels API,
  // held in metaIndex.
  const { areaHa, actionCount } = metaIndex[id] ?? {}
  const hasActionCount = typeof actionCount === 'number'
  setText(DOM_ID_SELECTED_PARCEL_REFERENCE, formatParcelReference(id))
  setText(DOM_ID_SELECTED_PARCEL_AREA, areaHa == null ? '' : `${Number(areaHa).toFixed(TOTAL_AREA_DECIMAL_PLACES)} ha`)
  setText(DOM_ID_SELECTED_PARCEL_ACTIONS, hasActionCount ? String(actionCount) : '')
  const actionsRow = document.getElementById(DOM_ID_SELECTED_PARCEL_ACTIONS_ROW)
  if (actionsRow) {
    actionsRow.hidden = !hasActionCount
  }
  if (noActions) {
    noActions.hidden = actionCount !== 0
  }
  details.hidden = false
}

/** @param {string[]} selectedIds */
const writeHiddenInputs = (selectedIds) => {
  const container = document.getElementById(DOM_ID_SELECTED_PARCELS_INPUTS)
  if (!container) {
    return
  }
  container.replaceChildren()
  selectedIds.forEach((id) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'landParcels'
    input.value = id
    input.disabled = document.getElementById('land-parcels')?.hidden === false
    container.appendChild(input)
  })
}

/**
 * Fetches the parcel's requirements notice, worded by the server so the copy
 * lives in one place. An empty items array means nothing applies; null means
 * the lookup failed or was aborted.
 * @param {string} parcelId
 * @param {string[]} enabledLandActions
 * @param {AbortSignal} signal
 * @returns {Promise<ParcelNotice | null>}
 */
const fetchConsentNotice = async (parcelId, enabledLandActions, signal) => {
  const crumb = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="crumb"]'))?.value
  const params = new URLSearchParams()
  enabledLandActions.forEach((action) => params.append('enabledLandActions', action))
  const query = params.toString()
  const querySuffix = query ? `?${query}` : ''
  const endpoint = `/api/land-grants/actions/${encodeURIComponent(parcelId)}/consents${querySuffix}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(crumb ? { 'X-CSRF-Token': crumb } : {}) },
      body: '{}',
      signal
    })
    if (!response.ok) {
      return null
    }
    const { intro, items, actionCount } = await response.json()
    if (typeof intro !== 'string' || !Array.isArray(items)) {
      return null
    }
    return {
      intro,
      items: items.filter((item) => typeof item === 'string'),
      ...(typeof actionCount === 'number' ? { actionCount } : {})
    }
  } catch {
    return null
  }
}

const clearRequirements = () => {
  const row = document.getElementById(DOM_ID_REQUIREMENTS_ROW)
  if (row) {
    row.hidden = true
  }
  setText(DOM_ID_REQUIREMENTS_INTRO, '')
  document.getElementById(DOM_ID_REQUIREMENTS_LIST)?.replaceChildren()
  setText(DOM_ID_REQUIREMENTS_STATUS, '')
}

/** @param {ParcelNotice} notice */
const showRequirements = (notice) => {
  setText(DOM_ID_REQUIREMENTS_INTRO, notice.intro)
  renderRequirementItems(document.getElementById(DOM_ID_REQUIREMENTS_LIST), notice.items)
  unhide(DOM_ID_REQUIREMENTS_ROW)
  setText(DOM_ID_REQUIREMENTS_STATUS, requirementsText(notice))
}

/**
 * @param {ParcelNotice} notice
 * @param {unknown} fallbackActionCount - The map's bulk count, used when the lookup did not count actions.
 * @returns {ParcelNotice}
 */
const withActionCount = (notice, fallbackActionCount) => {
  const actionCount = notice.actionCount ?? fallbackActionCount
  return typeof actionCount === 'number' ? { ...notice, actionCount } : notice
}

/**
 * Keeps the selected parcel details in step with the current selection.
 * Both views share cached details and at most one request. Changing the
 * selection aborts a request for a different parcel, so the latest selection
 * is fetched straight away and a stale response can never replace it. A
 * request that hangs is aborted after a timeout and reported as a failure.
 * @param {HTMLElement} mapEl
 * @returns {(selectedParcels: SelectedParcel[], metaIndex: import('./map-helpers.js').MetaIndex) => Promise<void>}
 */
function createSelectedParcelDetailsUpdater(mapEl) {
  const listDetails = createParcelListDetailsRenderer()
  const enabledActions = [
    ...new Set(
      (mapEl.getAttribute(ENABLED_LAND_ACTIONS_ATTRIBUTE) ?? '')
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean)
    )
  ]
  /** @type {Map<string, ParcelNotice>} */
  const notices = new Map()
  /** @type {import('./map-helpers.js').MetaIndex} */
  let latestMetaIndex = {}
  /** @type {{ id: string, controller: AbortController } | null} */
  let inFlight = null

  /**
   * @param {string} id
   * @param {ParcelNotice | null} notice
   */
  const show = (id, notice) => {
    if (notice?.items.length) {
      showRequirements(notice)
    }
    if (typeof notice?.actionCount === 'number' && typeof latestMetaIndex[id]?.actionCount !== 'number') {
      renderSelectedParcelDetails([{ id }], {
        [id]: { ...latestMetaIndex[id], id, actionCount: notice.actionCount }
      })
    }
    listDetails.render(id, notice)
  }

  /** @param {string} id @param {import('./map-helpers.js').MetaIndex} metaIndex */
  const loadNotice = async (id, metaIndex) => {
    listDetails.startLoading(id)
    const request = { id, controller: new AbortController() }
    inFlight = request
    const timeout = setTimeout(() => request.controller.abort(), PARCEL_DETAILS_REQUEST_TIMEOUT_MS)
    const bulkActionCount = metaIndex[id]?.actionCount
    const notice = await fetchConsentNotice(
      id,
      typeof bulkActionCount === 'number' ? [] : enabledActions,
      request.controller.signal
    )
    clearTimeout(timeout)
    // Superseded by a different selection. A timed-out request is still
    // current, so it falls through and reports the failure.
    if (inFlight !== request) {
      return
    }
    inFlight = null

    const result = notice && withActionCount(notice, latestMetaIndex[id]?.actionCount ?? bulkActionCount)
    if (result) {
      notices.set(id, result)
    }
    show(id, result)
  }

  return async function updateSelectedParcelDetails(selectedParcels, metaIndex) {
    clearRequirements()
    latestMetaIndex = metaIndex
    const id = selectedParcels.length === 1 ? selectedParcels[0].id : undefined

    if (inFlight && inFlight.id !== id) {
      inFlight.controller.abort()
      inFlight = null
    }
    if (!id) {
      listDetails.clear()
      return
    }
    const cached = notices.get(id)
    if (cached) {
      show(id, cached)
      return
    }
    // The same parcel is already loading, for example after switching views:
    // that response renders against the latest metaIndex.
    if (!inFlight) {
      await loadNotice(id, metaIndex)
    }
  }
}

/**
 * Attach terminal-event listeners and replay an event emitted before this
 * script loaded, when customElements.define() upgraded the map element.
 * @param {HTMLElement} mapEl
 * @param {(detail: ReadyDetail) => void} handleReady
 * @param {() => void} handleError
 */
function bindMapStatusEvents(mapEl, handleReady, handleError) {
  mapEl.addEventListener(EVENT_READY, (event) => {
    handleReady(/** @type {CustomEvent<ReadyDetail>} */ (event).detail ?? {})
  })
  mapEl.addEventListener(EVENT_ERROR, handleError)

  const mapWithHistory = /** @type {HTMLElement & { getLastEvent?: (type: string) => CustomEvent | null }} */ (mapEl)
  const lastReady = mapWithHistory.getLastEvent?.(EVENT_READY)
  if (lastReady) {
    handleReady(/** @type {ReadyDetail} */ (lastReady.detail ?? {}))
  }
  if (mapWithHistory.getLastEvent?.(EVENT_ERROR)) {
    handleError()
  }
}

/**
 * @param {HTMLElement & { clearSelection?: () => void, focusParcels?: () => void }} mapEl
 * @param {{ errorLinks: Element[], isList: () => boolean } | null} viewToggle
 */
function bindParcelNavigation(mapEl, viewToggle) {
  document.getElementById(DOM_ID_SELECTED_PARCEL_CHANGE)?.addEventListener('click', (event) => {
    event.preventDefault()
    mapEl.clearSelection?.()
  })
  // The toggle retargets these links at the active view, so bind them all once.
  viewToggle?.errorLinks.forEach((link) => {
    link.addEventListener('click', () => {
      if (!viewToggle.isList()) {
        mapEl.focusParcels?.()
      }
    })
  })
}

/** @param {SelectedParcel[]} selectedParcels @param {string | undefined} previousId */
function focusSelectedParcelDetails(selectedParcels, previousId) {
  const id = selectedParcels.length === 1 ? selectedParcels[0].id : undefined
  if (id && id !== previousId) {
    const details = document.getElementById(DOM_ID_SELECTED_PARCEL_DETAILS)
    details?.focus({ preventScroll: true })
    details?.scrollIntoView({ block: 'start' })
  }
  return id
}

/**
 * Wire the page's form DOM to a <parcel-map> element's events.
 * @param {HTMLElement | null} mapEl
 */
export function initParcelSelectPage(mapEl) {
  if (!mapEl) {
    return
  }

  /** @type {import('./map-helpers.js').MetaIndex} */
  let metaIndex = {}

  restoreParcelViewSelection(mapEl)
  const serverSelectedIds = (mapEl.dataset[DATASET_SELECTED_PARCELS] ?? '').split(',').filter(Boolean)
  writeHiddenInputs(serverSelectedIds)
  let selectedIds = serverSelectedIds
  let mapSelectedIds = /** @type {string[]} */ ([])
  let syncingMap = false
  /** @type {string | undefined} */
  let selectedParcelId = serverSelectedIds[0]

  const mapWithSelection = /** @type {HTMLElement & {
    clearSelection?: () => void,
    selectParcels?: (ids: string[]) => void,
    focusParcels?: () => void,
    resize?: () => void
  }} */ (mapEl)
  const updateSelectedParcelDetails = createSelectedParcelDetailsUpdater(mapEl)

  const syncMapSelection = () => {
    mapEl.removeAttribute(DEFER_LOADING_ATTRIBUTE)
    mapWithSelection.resize?.()
    const selectedParcels = selectedIds.map((id) => ({ id }))
    renderSelectedParcelDetails(selectedParcels, metaIndex)
    void updateSelectedParcelDetails(selectedParcels, metaIndex)
    if (selectedIds.join(',') === mapSelectedIds.join(',')) {
      return
    }
    // clearSelection emits synchronously; keep the form selection intact while
    // replacing the map's previous selection. selectParcels can complete later.
    syncingMap = true
    mapWithSelection.clearSelection?.()
    syncingMap = false
    mapWithSelection.selectParcels?.(selectedIds)
  }
  const viewToggle = initParcelViewToggle({
    onListSelection: (ids) => {
      selectedIds = ids
      selectedParcelId = ids.length === 1 ? ids[0] : undefined
      writeHiddenInputs(ids)
      void updateSelectedParcelDetails(
        ids.map((id) => ({ id })),
        {}
      )
    },
    onMapView: syncMapSelection,
    getSelectedIds: () => selectedIds
  })
  if (viewToggle?.isList() && selectedIds.length) {
    void updateSelectedParcelDetails(
      selectedIds.map((id) => ({ id })),
      {}
    )
  }

  /** @param {ReadyDetail} detail */
  const handleReady = (detail) => {
    metaIndex = detail.metaIndex ?? {}
    const parcelIds = detail.parcelIds ?? []
    updateMapTotals(metaIndex, parcelIds)

    // The map can recover after the server lookup rendered Continue disabled.
    const button = /** @type {HTMLButtonElement | null} */ (document.getElementById(DOM_ID_CONTINUE))
    if (parcelIds.length && button) {
      button.disabled = false
      button.setAttribute('aria-disabled', 'false')
    }

    if (!viewToggle?.isList()) {
      syncMapSelection()
    }
  }

  // A basemap/tiles failure must not disable the working text-list form. The
  // server renders the no-parcels and parcel-load errors, so none is shown here.
  const handleError = () => {
    viewToggle?.showList()
  }

  mapEl.addEventListener(EVENT_SELECTION, (/** @type {Event} */ e) => {
    const { selectedParcels } = /** @type {CustomEvent<SelectionDetail>} */ (e).detail
    mapSelectedIds = selectedParcels.map((p) => p.id)
    if (syncingMap || viewToggle?.isList()) {
      return
    }
    selectedIds = mapSelectedIds
    writeHiddenInputs(selectedIds)
    viewToggle?.syncSelection(selectedIds)
    renderSelectedParcelDetails(selectedParcels, metaIndex)
    void updateSelectedParcelDetails(selectedParcels, metaIndex)
    selectedParcelId = focusSelectedParcelDetails(selectedParcels, selectedParcelId)
  })

  bindMapStatusEvents(mapEl, handleReady, handleError)
  bindParcelNavigation(mapWithSelection, viewToggle)
}

initParcelSelectPage(document.getElementById(DOM_ID_PARCEL_MAP))

/**
 * @typedef {object} ReadyDetail
 * @property {string[]} [parcelIds]
 * @property {import('./map-helpers.js').MetaIndex} [metaIndex]
 */

/**
 * @typedef {{ id: string, [key: string]: unknown }} SelectedParcel
 */

/**
 * @typedef {object} SelectionDetail
 * @property {SelectedParcel[]} selectedParcels
 */

/**
 * @typedef {import('./parcel-list-details.js').ParcelNotice} ParcelNotice
 */
