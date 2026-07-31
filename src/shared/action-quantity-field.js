/**
 * Shared field-naming for the per-action quantity field, used by both the view-model
 * (renders the input) and the view-state (reads the submitted value back). Every
 * checked action uses this same field, whether it's a real, user-typed quantity
 * input or a non-quantity action's hidden field carrying its chosen area.
 */

export const ACTION_QUANTITY_FIELD_PREFIX = 'landActionQuantity_'

/**
 * Builds the form field name for an action's quantity field.
 * @param {string} actionCode
 * @returns {string}
 */
export function getActionQuantityFieldName(actionCode) {
  return `${ACTION_QUANTITY_FIELD_PREFIX}${actionCode}`
}
