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
const DOM_ID_SELECTED_PARCEL_SUMMARY_LIST = 'selected-parcel-summary-list'
const DOM_ID_ADDITIONAL_REQUIREMENTS_TEMPLATE = 'selected-parcel-additional-requirements-template'
const DOM_ID_ADDITIONAL_REQUIREMENTS_ROW = 'selected-parcel-additional-requirements-row'
const DOM_ID_ADDITIONAL_REQUIREMENTS = 'selected-parcel-additional-requirements'
const DOM_ID_ADDITIONAL_REQUIREMENTS_STATUS = 'selected-parcel-additional-requirements-status'
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
 * Fetches the parcel's consent notice, worded by the server so the copy lives
 * in one place. Empty string when nothing applies, null when the lookup
 * failed.
 * @param {string} parcelId
 * @returns {Promise<string | null>}
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
    const { text } = await response.json()
    return typeof text === 'string' ? text : null
  } catch {
    return null
  }
}

// The row is added and removed rather than toggled with `hidden`, because
// govuk-frontend gives .govuk-summary-list__row an author-level
// `display: table-row` from the tablet breakpoint up that outranks the
// user-agent `[hidden]` rule - a hidden row still renders, empty.
const clearAdditionalRequirements = () => {
  document.getElementById(DOM_ID_ADDITIONAL_REQUIREMENTS_ROW)?.remove()
  setText(DOM_ID_ADDITIONAL_REQUIREMENTS_STATUS, '')
}

/** @param {string} text */
const showAdditionalRequirements = (text) => {
  const list = document.getElementById(DOM_ID_SELECTED_PARCEL_SUMMARY_LIST)
  const template = /** @type {HTMLTemplateElement | null} */ (
    document.getElementById(DOM_ID_ADDITIONAL_REQUIREMENTS_TEMPLATE)
  )
  if (!list || !template) {
    return
  }
  list.appendChild(template.content.cloneNode(true))
  setText(DOM_ID_ADDITIONAL_REQUIREMENTS, text)
  setText(DOM_ID_ADDITIONAL_REQUIREMENTS_STATUS, text)
}

/**
 * Keeps the "Additional requirements" row in step with the current selection. The
 * notice belongs to the selected parcel, so every selection event, including
 * deselection and multi-selection, invalidates any lookup still in flight and
 * clears the row before asking for a new one.
 * @returns {(selectedParcels: SelectedParcel[]) => Promise<void>}
 */
function createConsentRequirementsUpdater() {
  let requestId = 0

  return async function updateConsentRequirements(selectedParcels) {
    requestId += 1
    const thisRequestId = requestId
    clearAdditionalRequirements()

    if (selectedParcels.length !== 1) {
      return
    }

    const text = await fetchConsentNotice(selectedParcels[0].id)
    if (thisRequestId !== requestId) {
      return
    }

    if (text) {
      showAdditionalRequirements(text)
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
