/**
 * Reads and writes a land action checkbox's state from the DOM: its quantity
 * input, its hidden chosen-area field, and the data attributes carrying the
 * areas the server and the availability API report.
 */

import { getActionChosenAreaDisplayId, getActionQuantityFieldName } from '../../../shared/action-quantity-field.js'
import { areaWithUnitText } from '../../../shared/area-text.js'

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
 * The field backing this action's quantity: a real, user-facing input for a
 * quantity action, or a hidden field carrying the chosen area for a
 * non-quantity action.
 * @param {HTMLInputElement} checkbox
 * @returns {HTMLInputElement | null}
 */
function getQuantityFieldElement(checkbox) {
  return /** @type {HTMLInputElement | null} */ (document.getElementById(getActionQuantityFieldName(checkbox.value)))
}

/**
 * A quantity action's real, user-facing input.
 * @param {HTMLInputElement} checkbox
 * @returns {HTMLInputElement | null}
 */
export function getQuantityInput(checkbox) {
  const field = getQuantityFieldElement(checkbox)
  return field?.type === 'hidden' ? null : field
}

/**
 * A non-quantity action's hidden field carrying its chosen area.
 * @param {HTMLInputElement} checkbox
 * @returns {HTMLInputElement | null}
 */
export function getChosenAreaField(checkbox) {
  const field = getQuantityFieldElement(checkbox)
  return field?.type === 'hidden' ? field : null
}

/**
 * A non-quantity action's available-area hint. Quantity actions use the
 * quantity input's own hint, while total actions share the hidden field's
 * naming convention without rendering that field as a visible input.
 * @param {HTMLInputElement} checkbox
 * @returns {HTMLElement | null}
 */
export function getNonQuantityHint(checkbox) {
  if (getQuantityInput(checkbox)) {
    return null
  }
  return document.getElementById(`${getActionQuantityFieldName(checkbox.value)}-hint`)
}

/**
 * Writes a total action's read-only chosen-area display without changing its
 * submitted hidden quantity. This is used for an unselected preview.
 * @param {HTMLInputElement} checkbox
 * @param {number} chosenArea
 */
export function setChosenAreaDisplay(checkbox, chosenArea) {
  const display = document.getElementById(getActionChosenAreaDisplayId(checkbox.value))
  if (display) {
    display.textContent = areaWithUnitText(chosenArea, checkbox.getAttribute(AVAILABLE_UNIT_ATTR) ?? undefined)
  }
}

/**
 * A checked action's chosen area is its hidden submitted field for a
 * non-quantity action, or its confirmed-area data attribute for a quantity
 * action. Keep the hidden value and selected read-only display in sync when a
 * confirmed total is written.
 * @param {HTMLInputElement} checkbox
 * @param {number} chosenArea
 */
export function setChosenArea(checkbox, chosenArea) {
  if (getQuantityInput(checkbox)) {
    checkbox.setAttribute(TOTAL_CHOSEN_AREA_ATTR, String(chosenArea))
  } else {
    const field = getChosenAreaField(checkbox)
    if (field) {
      field.value = String(chosenArea)
    }
    setChosenAreaDisplay(checkbox, chosenArea)
  }
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

/**
 * Parses a numeric data attribute, treating a blank or non-numeric value as absent.
 * @param {string | null} raw
 * @returns {number | undefined}
 */
function parseNumericAttr(raw) {
  if (raw == null || raw.trim() === '') {
    return undefined
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/** @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
export function getTotalAvailableArea(checkbox) {
  return parseNumericAttr(checkbox.getAttribute(TOTAL_AVAILABLE_AREA_ATTR))
}

/**
 * Headroom left for OTHER actions, most recently reported by the API.
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
export function getLiveAvailableArea(checkbox) {
  const raw = checkbox.getAttribute(LIVE_AVAILABLE_AREA_ATTR)
  return raw == null ? getTotalAvailableArea(checkbox) : parseNumericAttr(raw)
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
