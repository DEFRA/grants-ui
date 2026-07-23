import { getSelectedActionCodes, SELECTED_ACTIONS_FIELD_NAME } from '../utils/selected-actions-field.js'

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
    errors.push({ text: 'Select an action to do on this land parcel', href: `#${firstActionInput}` })
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
      text: 'Select an action to do on this land parcel',
      href: `#${SELECTED_ACTIONS_FIELD_NAME}`
    })
  }

  return errors
}
