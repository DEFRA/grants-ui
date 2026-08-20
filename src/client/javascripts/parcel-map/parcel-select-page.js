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
const DOM_ID_ENABLED_LAND_ACTIONS = 'enabled-land-actions'
const DOM_ID_ADDITIONAL_DETAILS_ROW = 'selected-parcel-additional-details-row'
const DOM_ID_ADDITIONAL_DETAILS = 'selected-parcel-additional-details'
const DOM_ID_ADDITIONAL_DETAILS_STATUS = 'selected-parcel-additional-details-status'

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
 * The map row's wording for a parcel's consent requirements. Membership-driven,
 * so SSSI stays first whatever order the API returns the keys in; an unknown or
 * empty set leaves the row hidden.
 * @param {string[]} consents
 * @returns {string}
 */
const consentRequirementText = (consents) => {
  const hasSssi = consents.includes('sssi')
  const hasHefer = consents.includes('hefer')
  if (hasSssi && hasHefer) {
    return 'SSSI consent and an SFI HEFER may apply to some actions'
  }
  if (hasSssi) {
    return 'SSSI consent may apply to some actions'
  }
  if (hasHefer) {
    return 'An SFI HEFER may apply to some actions'
  }
  return ''
}

/**
 * The journey's rendered action codes, which scope the requirement lookup to
 * the actions the user could actually go on to choose.
 * @returns {string[]}
 */
const readEnabledLandActions = () => {
  /** @type {string[]} */
  const codes = []
  for (const el of document.querySelectorAll(`#${DOM_ID_ENABLED_LAND_ACTIONS} [data-enabled-land-action]`)) {
    const code = el.getAttribute('data-enabled-land-action')
    if (code) {
      codes.push(code)
    }
  }
  return codes
}

/**
 * @param {string} parcelId
 * @param {string[]} enabledLandActions
 * @returns {Promise<string[] | null>} The parcel's consent keys, or null when the lookup failed.
 */
const postConsentRequirements = async (parcelId, enabledLandActions) => {
  const crumb = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="crumb"]'))?.value
  try {
    const response = await fetch(`/api/land-grants/actions/${encodeURIComponent(parcelId)}/consents`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(crumb ? { 'X-CSRF-Token': crumb } : {}) },
      body: JSON.stringify({ enabledLandActions })
    })
    if (!response.ok) {
      return null
    }
    /** @type {{ consents?: unknown }} */
    const { consents } = await response.json()
    return Array.isArray(consents) ? consents : null
  } catch {
    return null
  }
}

const clearAdditionalDetails = () => {
  const row = document.getElementById(DOM_ID_ADDITIONAL_DETAILS_ROW)
  if (row) {
    row.hidden = true
  }
  setText(DOM_ID_ADDITIONAL_DETAILS, '')
  setText(DOM_ID_ADDITIONAL_DETAILS_STATUS, '')
}

/** @param {string} text */
const showAdditionalDetails = (text) => {
  setText(DOM_ID_ADDITIONAL_DETAILS, text)
  unhide(DOM_ID_ADDITIONAL_DETAILS_ROW)
  // Written last: the status region only announces text once the row carrying
  // it is actually visible.
  setText(DOM_ID_ADDITIONAL_DETAILS_STATUS, text)
}

/**
 * Keeps the "Additional details" row in step with the current selection. The
 * requirement is a property of the selected parcel's own actions, so every
 * selection event - including deselection and multi-selection - invalidates
 * any in-flight lookup and clears the row before a new one is asked for.
 * @returns {(selectedParcels: SelectedParcel[]) => Promise<void>}
 */
function createConsentRequirementsUpdater() {
  let requestId = 0

  return async function updateConsentRequirements(selectedParcels) {
    requestId += 1
    const thisRequestId = requestId
    clearAdditionalDetails()

    if (selectedParcels.length !== 1) {
      return
    }

    const consents = await postConsentRequirements(selectedParcels[0].id, readEnabledLandActions())
    if (thisRequestId !== requestId) {
      // A newer selection has already taken over - this response describes a
      // parcel that is no longer the one being shown.
      return
    }

    const text = consentRequirementText(consents ?? [])
    if (text) {
      showAdditionalDetails(text)
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

  /** @param {ReadyDetail} detail */
  const handleReady = (detail) => {
    metaIndex = detail.metaIndex ?? {}
    updateMapTotals(metaIndex, detail.parcelIds ?? [])
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
    // Informational only: a failed or slow lookup must never block Continue,
    // so the selection handler does not await it.
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

  const mapWithSelection = /** @type {HTMLElement & { clearSelection?: () => void }} */ (mapEl)
  const changeLink = document.getElementById(DOM_ID_SELECTED_PARCEL_CHANGE)
  changeLink?.addEventListener('click', (e) => {
    e.preventDefault()
    mapWithSelection.clearSelection?.()
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
