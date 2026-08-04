/**
 * Whether an action needs a user-typed quantity: 'partial'/'limited' do,
 * 'total' (or unset) don't. Shared so server (metadata.availableAreaType)
 * and client (its DOM mirror, data-available-area-type) agree.
 */

export const QUANTITY_INPUT_AREA_TYPES = ['partial', 'limited']

/**
 * @param {string | undefined | null} availableAreaType
 * @returns {boolean}
 */
export function requiresQuantityInput(availableAreaType) {
  return QUANTITY_INPUT_AREA_TYPES.includes(availableAreaType ?? '')
}
