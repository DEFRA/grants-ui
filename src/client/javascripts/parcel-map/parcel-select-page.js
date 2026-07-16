// Page-level wiring for the land-parcel selection form. Consumes the three
// public events emitted by <parcel-map> and drives this journey's form DOM
// (hidden inputs, hint, live summary, no-parcels error, Continue button).
import { EVENT_READY, EVENT_ERROR, EVENT_SELECTION, ERROR_REASON_NO_PARCELS, MULTI_SELECT_ATTRIBUTE } from './config.js'

/** @param {string} id */
const unhide = (id) => {
  const el = document.getElementById(id)
  if (el) {
    el.hidden = false
  }
}

/** @param {string[]} selectedIds */
const writeHiddenInputs = (selectedIds) => {
  const container = document.getElementById('selected-parcels-inputs')
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
 * @param {string[]} selectedIds
 * @param {boolean} multiSelect
 */
const updateSummary = (selectedIds, multiSelect) => {
  const summary = document.getElementById('parcel-selection-summary')
  if (!summary) {
    return
  }
  if (selectedIds.length === 0) {
    summary.textContent = multiSelect ? 'No parcels selected.' : 'No parcel selected.'
    return
  }
  summary.textContent = 'Selected: ' + selectedIds.join(', ')
}

/**
 * Wire the page's form DOM to a <parcel-map> element's events.
 * @param {HTMLElement | null} mapEl
 */
export function initParcelSelectPage(mapEl) {
  if (!mapEl) {
    return
  }
  const multiSelect = mapEl.getAttribute(MULTI_SELECT_ATTRIBUTE) === 'true'

  mapEl.addEventListener(EVENT_READY, () => {
    unhide('map-hint')
    unhide('parcel-selection-summary')
  })

  mapEl.addEventListener(EVENT_ERROR, (/** @type {Event} */ e) => {
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('map-select-continue'))
    if (btn) {
      btn.disabled = true
    }
    if (/** @type {CustomEvent<ParcelMapErrorDetail>} */ (e).detail.reason === ERROR_REASON_NO_PARCELS) {
      unhide('map-no-parcels-error')
    }
  })

  mapEl.addEventListener(EVENT_SELECTION, (/** @type {Event} */ e) => {
    const selectedIds = /** @type {CustomEvent<SelectionDetail>} */ (e).detail.selectedIds
    writeHiddenInputs(selectedIds)
    updateSummary(selectedIds, multiSelect)
  })
}

initParcelSelectPage(document.getElementById('parcel-map'))

/**
 * @typedef {object} SelectionDetail
 * @property {string[]} selectedIds
 */

/**
 * @typedef {object} ParcelMapErrorDetail
 * @property {string} reason
 */
