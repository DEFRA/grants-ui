/**
 * Units the land-grants API measures an action's availability in area,
 * linear, or a plain count.
 */
export const SQUARE_METRES = 'sqm'
export const COUNT = 'count'
export const UNIT_TYPES = ['ha', SQUARE_METRES, 'm', COUNT]

/**
 * Whether the unit's quantity must be a whole number.
 * @param {string | null | undefined} unit
 * @returns {boolean}
 */
export function requiresWholeNumber(unit) {
  return unit === SQUARE_METRES || unit === COUNT
}
