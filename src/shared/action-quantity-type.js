/**
 * Whether an action needs a user-typed quantity: 'partial' does, 'total'
 * (or unset) doesn't. Shared so server (action.availability.type) and
 * client (its DOM mirror, data-available-area-type) agree.
 */

export const QUANTITY_INPUT_AREA_TYPES = ['partial']

/**
 * @param {string | undefined | null} availabilityType
 * @returns {boolean}
 */
export function requiresQuantityInput(availabilityType) {
  return QUANTITY_INPUT_AREA_TYPES.includes(availabilityType ?? '')
}
