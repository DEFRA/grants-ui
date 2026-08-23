import { getSelectedActionCodes, SELECTED_ACTIONS_FIELD_NAME } from '../utils/selected-actions-field.js'
import { getActionQuantityFieldName } from '~/src/shared/action-quantity-field.js'
import { requiresQuantityInput } from '~/src/shared/action-quantity-type.js'
import { hasSubmittedNonZeroQuantity } from '../view-state/land-parcel.view-state.js'

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

const QUANTITY_PRECISION = 4
// Stricter than Number(value): rejects "14.211.442121", "1e5", etc. rather
// than letting them slip through as NaN or unbounded-precision numbers.
const QUANTITY_FORMAT = new RegExp(String.raw`^\d+(\.\d{1,${QUANTITY_PRECISION}})?$`)

/**
 * Validate that every selected, quantity-required action has a confirmed
 * (submitted, non-zero) quantity, in plain decimal form with no more than 4
 * decimal places. Each error carries the action's code so the caller can
 * also highlight its specific input, not just list the error in the summary.
 * @param {object} payload - Form payload
 * @param {Action[]} actions
 * @returns {Array<{text: string, href: string, code: string}>} - Array of validation errors
 */
export function validateSelectedActionQuantities(payload, actions) {
  const selectedCodes = new Set(getSelectedActionCodes(payload))
  const errors = []

  const applicableActions = actions.filter(
    (action) => selectedCodes.has(action.code) && requiresQuantityInput(action.availability?.type)
  )

  for (const action of applicableActions) {
    const href = `#${getActionQuantityFieldName(action.code)}`
    if (!hasSubmittedNonZeroQuantity(payload, action)) {
      errors.push({ text: `Enter a quantity for ${action.description}`, href, code: action.code })
      continue
    }
    const rawValue = String(payload[getActionQuantityFieldName(action.code)]).trim()
    if (!QUANTITY_FORMAT.test(rawValue)) {
      errors.push({
        text: `Quantity for ${action.description} must be ${QUANTITY_PRECISION} decimal places or fewer`,
        href,
        code: action.code
      })
    }
  }

  return errors
}

/**
 * @import { Action } from '../view-state/land-parcel.view-state.js'
 */
