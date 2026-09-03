/**
 * Reads and writes a land action checkbox's state from the DOM: its quantity
 * input, its hidden chosen-area field, and the data attributes carrying the
 * areas the server and the availability API report.
 */

import { getActionQuantityFieldName } from '../../../shared/action-quantity-field.js'

export const CHECKBOX_NAME = 'landAction'
export const AVAILABLE_UNIT_ATTR = 'data-available-unit'
export const TOTAL_AVAILABLE_AREA_ATTR = 'data-total-available-area'
export const LIVE_AVAILABLE_AREA_ATTR = 'data-live-available-area'
export const TOTAL_CHOSEN_AREA_ATTR = 'data-total-chosen-area'

/** @param {HTMLElement} form */
export function getCheckboxes(form) {
  return /** @type {HTMLInputElement[]} */ (
    Array.from(form.querySelectorAll(`input[type="checkbox"][name="${CHECKBOX_NAME}"]`))
  )
}

/**
 * A quantity action's real, user-facing input.
 * @param {HTMLInputElement} checkbox
 * @returns {HTMLInputElement | null}
 */
export function getQuantityInput(checkbox) {
  const field = /** @type {HTMLInputElement | null} */ (
    document.getElementById(getActionQuantityFieldName(checkbox.value))
  )
  return field?.type === 'hidden' ? null : field
}

/**
 * A non-quantity action's hidden field carrying its chosen area.
 * @param {HTMLInputElement} checkbox
 * @returns {HTMLInputElement | null}
 */
export function getChosenAreaField(checkbox) {
  const field = /** @type {HTMLInputElement | null} */ (
    document.getElementById(getActionQuantityFieldName(checkbox.value))
  )
  return field?.type === 'hidden' ? field : null
}

/**
 * A checked action redisplayed from a rejected submission (see
 * data-error-on-load) must keep its own checked state, typed value and
 * chosen area untouched by the live refresh, until the user directly
 * interacts with it.
 * @param {HTMLInputElement} checkbox
 * @returns {boolean}
 */
export function isProtectedFromRefresh(checkbox) {
  return checkbox.checked && Boolean(checkbox.dataset.errorOnLoad)
}

/**
 * A direct interaction with this checkbox (or its own quantity input) means
 * its rejected value is no longer what's protected.
 * @param {HTMLInputElement} checkbox
 */
export function clearErrorOnLoad(checkbox) {
  delete checkbox.dataset.errorOnLoad
}

/** @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
export function getTotalAvailableArea(checkbox) {
  const raw = checkbox.getAttribute(TOTAL_AVAILABLE_AREA_ATTR)
  if (raw == null || raw.trim() === '') {
    return undefined
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Headroom left for OTHER actions, most recently reported by the API.
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
export function getLiveAvailableArea(checkbox) {
  const raw = checkbox.getAttribute(LIVE_AVAILABLE_AREA_ATTR)
  if (raw == null) {
    return getTotalAvailableArea(checkbox)
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/**
 * What a checked action currently holds - its own hidden field (non-quantity)
 * or data-total-chosen-area (quantity action, which has no hidden field of
 * its own).
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
export function getChosenArea(checkbox) {
  if (getQuantityInput(checkbox)) {
    const raw = checkbox.getAttribute(TOTAL_CHOSEN_AREA_ATTR)
    const chosenArea = raw == null ? Number.NaN : Number(raw)
    return Number.isFinite(chosenArea) ? chosenArea : undefined
  }
  const value = Number(getChosenAreaField(checkbox)?.value)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Records a non-quantity action's chosen area in its hidden field, for both live client use and form submission.
 * @param {HTMLInputElement} checkbox
 * @param {number} chosenArea
 */
export function setChosenArea(checkbox, chosenArea) {
  const field = getChosenAreaField(checkbox)
  if (field) {
    field.value = String(chosenArea)
  }
}

/**
 * @param {HTMLInputElement} checkbox
 */
export function clearChosenArea(checkbox) {
  if (getQuantityInput(checkbox)) {
    checkbox.removeAttribute(TOTAL_CHOSEN_AREA_ATTR)
    return
  }
  const field = getChosenAreaField(checkbox)
  if (field) {
    field.value = '0'
  }
}
