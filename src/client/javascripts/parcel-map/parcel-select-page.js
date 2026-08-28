// Page-level wiring for the land-parcel selection form. Consumes the three
// public events emitted by <parcel-map> and drives this journey's form DOM
// (hidden inputs, hint, live summary, no-parcels error, Continue button).
import {
  EVENT_READY,
  EVENT_ERROR,
  EVENT_SELECTION,
  ERROR_REASON_NO_PARCELS,
  TOTAL_AREA_DECIMAL_PLACES
} from './config.js'
import { formatParcelReference } from '../../../shared/format-parcel.js'

// DOM ids this script expects map-select-parcel.html to provide.
const DOM_ID_PARCEL_MAP = 'parcel-map'
const DOM_ID_MAP_NO_PARCELS_ERROR = 'map-no-parcels-error'
const DOM_ID_MAP_SELECT_CONTINUE = 'map-select-continue'
const DOM_ID_PARCEL_MAP_TOTAL_COUNT = 'parcel-map-total-count'
const DOM_ID_PARCEL_MAP_TOTAL_AREA = 'parcel-map-total-area'
const DOM_ID_SELECTED_PARCEL_DETAILS = 'selected-parcel-details'
const DOM_ID_SELECTED_PARCEL_REFERENCE = 'selected-parcel-reference'
const DOM_ID_SELECTED_PARCEL_AREA = 'selected-parcel-area'
const DOM_ID_SELECTED_PARCEL_CHANGE = 'selected-parcel-change'
const DOM_ID_SELECTED_PARCELS_INPUTS = 'selected-parcels-inputs'
const DOM_ID_REQUIREMENTS_ROW = 'selected-parcel-requirements-row'
const DOM_ID_REQUIREMENTS_INTRO = 'selected-parcel-requirements-intro'
const DOM_ID_REQUIREMENTS_LIST = 'selected-parcel-requirements-list'
const DOM_ID_REQUIREMENTS_STATUS = 'selected-parcel-requirements-status'
const SELECTOR_ERROR_SUMMARY_MAP_LINK = `.govuk-error-summary a[href="#${DOM_ID_PARCEL_MAP}"]`
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
 */
const updateSelectedParcelDetails = (selectedParcels) => {
  const details = document.getElementById(DOM_ID_SELECTED_PARCEL_DETAILS)
  if (!details) {
    return
  }
  if (selectedParcels.length !== 1) {
    details.hidden = true
    return
  }
  const [{ id, areaHa }] = selectedParcels
  setText(DOM_ID_SELECTED_PARCEL_REFERENCE, formatParcelReference(id))
  setText(
    DOM_ID_SELECTED_PARCEL_AREA,
    areaHa == null ? '' : `${Number(areaHa).toFixed(TOTAL_AREA_DECIMAL_PLACES)} hectares`
  )
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
    container.appendChild(input)
  })
}

/**
 * Fetches the parcel's requirements notice, worded by the server so the copy
 * lives in one place. An empty items array means nothing applies; null means
 * the lookup failed.
 * @param {string} parcelId
 * @returns {Promise<{ intro: string, items: string[] } | null>}
 */
const fetchConsentNotice = async (parcelId) => {
  const crumb = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="crumb"]'))?.value
  try {
    const response = await fetch(`/api/land-grants/actions/${encodeURIComponent(parcelId)}/consents`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(crumb ? { 'X-CSRF-Token': crumb } : {}) },
      body: '{}'
    })
    if (!response.ok) {
      return null
    }
    const { intro, items } = await response.json()
    if (typeof intro !== 'string' || !Array.isArray(items)) {
      return null
    }
    return { intro, items: items.filter((item) => typeof item === 'string') }
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

/**
 * @param {string} intro
 * @param {string[]} items
 */
const showRequirements = (intro, items) => {
  setText(DOM_ID_REQUIREMENTS_INTRO, intro)
  const list = document.getElementById(DOM_ID_REQUIREMENTS_LIST)
  // textContent, never innerHTML: this copy arrives over fetch.
  list?.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement('li')
      li.textContent = item
      return li
    })
  )
  unhide(DOM_ID_REQUIREMENTS_ROW)
  // One utterance: the intro alone tells a screen-reader user nothing.
  setText(DOM_ID_REQUIREMENTS_STATUS, `${intro} ${items.join(', ')}`)
}

/**
 * Keeps the "Requirements" row in step with the current selection. The notice
 * belongs to the selected parcel, so every selection event, including
 * deselection and multi-selection, invalidates any lookup still in flight and
 * clears the row before asking for a new one.
 * @returns {(selectedParcels: SelectedParcel[]) => Promise<void>}
 */
function createConsentRequirementsUpdater() {
  let requestId = 0

  return async function updateConsentRequirements(selectedParcels) {
    requestId += 1
    const thisRequestId = requestId
    clearRequirements()

    if (selectedParcels.length !== 1) {
      return
    }

    const notice = await fetchConsentNotice(selectedParcels[0].id)
    if (thisRequestId !== requestId) {
      return
    }

    if (notice?.items.length) {
      showRequirements(notice.intro, notice.items)
    }
  }
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

  const serverSelectedIds = (mapEl.dataset[DATASET_SELECTED_PARCELS] ?? '').split(',').filter(Boolean)

  const mapWithSelection = /** @type {HTMLElement & {
    clearSelection?: () => void,
    selectParcels?: (ids: string[]) => void,
    focusParcels?: () => void
  }} */ (mapEl)

  /** @param {ReadyDetail} detail */
  const handleReady = (detail) => {
    metaIndex = detail.metaIndex ?? {}
    updateMapTotals(metaIndex, detail.parcelIds ?? [])

    if (serverSelectedIds.length > 0) {
      mapWithSelection.selectParcels?.(serverSelectedIds)
    }
  }

  /** @param {ParcelMapErrorDetail} detail */
  const handleError = (detail) => {
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById(DOM_ID_MAP_SELECT_CONTINUE))
    if (btn) {
      btn.disabled = true
    }
    if (detail.reason === ERROR_REASON_NO_PARCELS) {
      unhide(DOM_ID_MAP_NO_PARCELS_ERROR)
    }
  }

  mapEl.addEventListener(EVENT_READY, (/** @type {Event} */ e) => {
    handleReady(/** @type {CustomEvent<ReadyDetail>} */ (e).detail ?? {})
  })

  mapEl.addEventListener(EVENT_ERROR, (/** @type {Event} */ e) => {
    handleError(/** @type {CustomEvent<ParcelMapErrorDetail>} */ (e).detail)
  })

  const updateConsentRequirements = createConsentRequirementsUpdater()

  mapEl.addEventListener(EVENT_SELECTION, (/** @type {Event} */ e) => {
    const { selectedParcels } = /** @type {CustomEvent<SelectionDetail>} */ (e).detail
    writeHiddenInputs(selectedParcels.map((p) => p.id))
    updateSelectedParcelDetails(selectedParcels)
    updateConsentRequirements(selectedParcels)
  })

  // customElements.define() upgrades an already-parsed <parcel-map> synchronously,
  // so its data fetch can resolve — dispatching EVENT_READY/EVENT_ERROR — before this
  // script (loaded via a later <script type="module">) has attached the listeners
  // above. getLastEvent() catches up on whichever terminal event already fired.
  const mapWithHistory = /** @type {HTMLElement & { getLastEvent?: (type: string) => CustomEvent | null } } */ (mapEl)
  const lastReady = mapWithHistory.getLastEvent?.(EVENT_READY)
  if (lastReady) {
    handleReady(/** @type {ReadyDetail} */ (lastReady.detail ?? {}))
  }
  const lastError = mapWithHistory.getLastEvent?.(EVENT_ERROR)
  if (lastError) {
    handleError(/** @type {ParcelMapErrorDetail} */ (lastError.detail))
  }

  const changeLink = document.getElementById(DOM_ID_SELECTED_PARCEL_CHANGE)
  changeLink?.addEventListener('click', (e) => {
    e.preventDefault()
    mapWithSelection.clearSelection?.()
  })

  document.querySelectorAll(SELECTOR_ERROR_SUMMARY_MAP_LINK).forEach((link) => {
    link.addEventListener('click', () => mapWithSelection.focusParcels?.())
  })
}

initParcelSelectPage(document.getElementById(DOM_ID_PARCEL_MAP))

/**
 * @typedef {object} ReadyDetail
 * @property {string[]} [parcelIds]
 * @property {import('./map-helpers.js').MetaIndex} [metaIndex]
 */

/**
 * @typedef {object} SelectedParcel
 * @property {string} id
 * @property {number | null} [areaHa]
 */

/**
 * @typedef {object} SelectionDetail
 * @property {SelectedParcel[]} selectedParcels
 */

/**
 * @typedef {object} ParcelMapErrorDetail
 * @property {string} reason
 */
