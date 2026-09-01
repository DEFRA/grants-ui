import { formatArea } from './format-area.js'
import { formatUnit } from './format-unit.js'

export const TOTAL_ACTION_AREA_GUIDANCE = 'This action will use all the available area on this land parcel.'

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
