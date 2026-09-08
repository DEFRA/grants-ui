import { formatUnit } from './format-unit.js'

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
export function areaWithUnitText(value, unit) {
  return formatArea(value, formatUnit(unit))
}

/**
 * What is still claimable, for an action's hint - the headroom left after
 * every other selection, including whatever this action itself already holds.
 * @param {number} value
 * @param {string} [unit]
 * @returns {string}
 */
export function availableAreaText(value, unit) {
  return `${areaWithUnitText(value, unit)} available`
}
