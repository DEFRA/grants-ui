import { formatAreaUnit } from './format-area-unit.js'
import { formatLinearUnit } from './format-linear-unit.js'
import { requiresWholeNumber } from './unit-types.js'

/**
 * Format a unit abbreviation that may be either area (e.g. "ha") or linear
 * (e.g. "m"). Actions are sized in one or the other depending on the action,
 * so callers holding an action's unit can't pick a formatter up front.
 * Both formatters return their input unchanged when they don't recognise it,
 * which is how the linear lookup is distinguished from a miss.
 * @param {string} abbrev - Unit abbreviation
 * @returns {string} - full unit name, or the abbreviation if unrecognised
 */
export function formatUnit(abbrev = '') {
  const linear = formatLinearUnit(abbrev)
  return linear === abbrev ? formatAreaUnit(abbrev) : linear
}

/**
 * Joins the quantity and unit, skipping either half when it is missing so the
 * output never contains "undefined". Whole-number units have no decimal places; other numeric quantities get four decimal
 * places so areas line up down a column, and so a fully-claimed action reads
 * as an explicit "0.0000" rather than a bare "0"; any other value passes
 * through unchanged rather than being validated here.
 * @param {unknown} quantity
 * @param {unknown} unit
 * @returns {string}
 */
export function formatArea(quantity, unit) {
  const area = formatQuantity(quantity, unit)
  return [area, unit].filter((part) => part !== undefined && part !== null && part !== '').join(' ')
}

/**
 * @param {unknown} quantity
 * @param {unknown} unit
 * @returns {unknown}
 */
function formatQuantity(quantity, unit) {
  const wholeNumber = typeof unit === 'string' && requiresWholeNumber(unit)
  const decimalPlaces = wholeNumber ? 0 : 4
  return typeof quantity === 'number' && Number.isFinite(quantity) ? quantity.toFixed(decimalPlaces) : quantity
}

/**
 * A quantity with its full unit name, e.g. "39.8100 hectares" or "12 square metres".
 * Determine precision using the original unit before expanding its label.
 * @param {number} value
 * @param {string} [unit]
 * @returns {string}
 */
export function areaWithUnit(value, unit) {
  return formatArea(formatQuantity(value, unit), formatUnit(unit))
}

/**
 * What is still claimable, for an action's hint - the headroom left after
 * every other selection, including whatever this action itself already holds.
 * @param {number} value
 * @param {string} [unit]
 * @returns {string}
 */
export function availableArea(value, unit) {
  return `${areaWithUnit(value, unit)} available`
}
