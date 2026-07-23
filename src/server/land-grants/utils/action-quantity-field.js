/**
 * Shared field-naming for the per-action quantity input, used by both the view-model
 * (renders the input) and the view-state (reads the submitted value back).
 */

const ACTION_QUANTITY_FIELD_PREFIX = 'landActionQuantity_'

/**
 * Builds the form field name for an action's quantity input
 * @param {string} actionCode
 * @returns {string}
 */
export function getActionQuantityFieldName(actionCode) {
  return `${ACTION_QUANTITY_FIELD_PREFIX}${actionCode}`
}
