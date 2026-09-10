import { getSelectedActionCodes, SELECTED_ACTIONS_FIELD_NAME } from '../utils/selected-actions-field.js'
import { getActionQuantityFieldName } from '~/src/shared/action-quantity-field.js'
import { requiresQuantityInput } from '~/src/shared/action-quantity-type.js'
import { requiresWholeNumber } from '~/src/shared/unit-types.js'
import { QUANTITY_PRECISION, getQuantityError } from '~/src/shared/action-quantity-validation.js'

/**
 * Validators for land actions selection
 */

/**
 * Extract land action fields from payload
 * @param {object} payload - Form payload
 * @param {string} actionFieldPrefix - Prefix for action field names (e.g., 'landAction_')
 * @returns {Array<string>} - Array of field names that match the prefix
 */
export function extractLandActionFields(payload, actionFieldPrefix) {
  return Object.keys(payload).filter((key) => key.startsWith(actionFieldPrefix))
}

/**
 * Validate land actions selection
 * @param {object} payload - Form payload
 * @param {string} actionFieldPrefix - Prefix for action field names
 * @returns {Array<{text: string, href: string}>} - Array of validation errors
 */
export function validateLandActionsSelection(payload, actionFieldPrefix) {
  const errors = []
  const landActionFields = extractLandActionFields(payload, actionFieldPrefix)

  if (landActionFields.length === 0) {
    const firstActionInput = actionFieldPrefix + '1'
    errors.push({ text: 'Select at least one action', href: `#${firstActionInput}` })
  }

  return errors
}

/**
 * Validate the select-actions page's selection, where every action shares one
 * checkbox field name rather than a field per action.
 * @param {object} payload - Form payload
 * @returns {Array<{text: string, href: string}>} - Array of validation errors
 */
export function validateSelectedActions(payload) {
  const errors = []

  if (getSelectedActionCodes(payload).length === 0) {
    errors.push({
      text: 'Select at least one action',
      href: `#${SELECTED_ACTIONS_FIELD_NAME}`
    })
  }

  return errors
}

/**
 * Returns the appropriate quantity error message for a selected action.
 * @param {Action} action
 * @param {string} rawValue
 * @returns {string | null}
 */
function getActionQuantityErrorText(action, rawValue) {
  if (rawValue !== '' && requiresWholeNumber(action.availability?.unit)) {
    return getQuantityError(rawValue, undefined, action.availability?.unit)
  }

  // Empty, zero and negative area claims all require the user to enter a quantity.
  if (rawValue === '' || Number(rawValue) <= 0) {
    return `Enter a quantity for ${action.description}`
  }

  // Preserve the action-specific format message for decimals and non-numeric input.
  if (getQuantityError(rawValue)) {
    return `Quantity for ${action.description} must be ${QUANTITY_PRECISION} decimal places or fewer`
  }

  return null
}

/**
 * Validate that every selected, quantity-required action has a submitted
 * quantity that satisfies the shared rules (see getQuantityError). Each error
 * carries the action's code so the caller can also highlight its specific
 * input, not just list the error in the summary.
 * @param {object} payload - Form payload
 * @param {Action[]} actions
 * @returns {Array<{text: string, href: string, code: string}>} - Array of validation errors
 */
export function validateSelectedActionQuantities(payload, actions) {
  const selectedCodes = new Set(getSelectedActionCodes(payload))
  const errors = []

  const applicableActions = actions.filter((action) => selectedCodes.has(action.code) && requiresQuantityInput(action))

  for (const action of applicableActions) {
    const rawValue = String(payload[getActionQuantityFieldName(action.code)] ?? '').trim()
    const text = getActionQuantityErrorText(action, rawValue)
    if (text) {
      errors.push({ text, href: `#${getActionQuantityFieldName(action.code)}`, code: action.code })
    }
  }

  return errors
}

/**
 * @import { Action } from '../view-state/land-parcel.view-state.js'
 */
