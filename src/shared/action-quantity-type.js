/**
 * Whether an action needs a user-typed quantity: 'partial' does, 'total'
 * (or unset) doesn't. This remains the agreed contract until the separate
 * quantity-input work is delivered.
 */

export const QUANTITY_INPUT_AREA_TYPES = ['partial']

/**
 * @param {string | undefined | null} availabilityType
 * @returns {boolean}
 */
export function requiresQuantityInput(availabilityType) {
  return QUANTITY_INPUT_AREA_TYPES.includes(availabilityType ?? '')
}
