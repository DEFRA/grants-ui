/**
 * Whether the API requires a user-entered quantity for an action.
 * @param {{ quantityRequired?: boolean } | undefined} action
 * @returns {boolean}
 */
export function requiresQuantityInput(action) {
  return action?.quantityRequired === true
}
