/**
 * Whether an action needs a user-typed quantity, as declared by the API's
 * inputRequired flag. By contract an action whose availability.value is null
 * (no restriction) always sets the flag - there is no amount to fall back to.
 */

/**
 * @param {boolean | undefined | null} inputRequired
 * @returns {boolean}
 */
export function requiresQuantityInput(inputRequired) {
  return inputRequired === true
}
