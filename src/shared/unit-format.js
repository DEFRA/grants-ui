import { formatAreaUnit } from './format-area-unit.js'
import { formatLinearUnit } from './format-linear-unit.js'

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
 * output never contains "undefined". A numeric quantity gets four decimal
 * places so areas line up down a column, and so a fully-claimed action reads
 * as an explicit "0.0000" rather than a bare "0"; any other value passes
 * through unchanged rather than being validated here.
 * @param {unknown} quantity
 * @param {unknown} unit
 * @returns {string}
 */
export function formatArea(quantity, unit) {
  const area = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity.toFixed(4) : quantity
  return [area, unit].filter((part) => part !== undefined && part !== null && part !== '').join(' ')
}

/**
 * An area with its full unit name, e.g. "39.8100 hectares". Four decimal
 * places throughout so a fully claimed action reads as "0.0000" and areas
 * line up wherever they are listed together.
 * @param {number} value
 * @param {string} [unit]
 * @returns {string}
 */
export function areaWithUnit(value, unit) {
  return formatArea(value, formatUnit(unit))
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
