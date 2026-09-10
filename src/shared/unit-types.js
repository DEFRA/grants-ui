/**
 * Units the land-grants API measures an action's availability in area,
 * linear, or a plain count.
 */
export const UNIT_HECTARES = 'ha'
export const UNIT_SQUARE_METRES = 'sqm'
export const UNIT_METRES = 'm'
export const UNIT_COUNT = 'count'
export const UNITS = [UNIT_HECTARES, UNIT_SQUARE_METRES, UNIT_METRES, UNIT_COUNT]

/**
 * Whether the unit measures an area of land.
 * @param {string | null | undefined} unit
 * @returns {boolean}
 */
export function isLandAreaUnit(unit) {
  return unit === UNIT_HECTARES
}

/**
 * Whether the unit's quantity must be a whole number.
 * @param {string | null | undefined} unit
 * @returns {boolean}
 */
export function requiresWholeNumber(unit) {
  return unit === UNIT_SQUARE_METRES || unit === UNIT_COUNT
}
