import { formatArea } from './format-area.js'
import { formatUnit } from './format-unit.js'

/**
 * A total action always claims everything left on the parcel, so it has no
 * quantity input to explain itself - this guidance line does it instead.
 */
export const TOTAL_ACTION_AREA_GUIDANCE = 'This action will use all the available area on this land parcel.'

/**
 * The hint for a selected total action: what it took, and what that leaves.
 * @param {number} applied - Area this action has claimed
 * @param {number} remaining - Area still claimable by it afterwards
 * @param {string} [unit]
 * @returns {string}
 */
export function totalActionAppliedText(applied, remaining, unit) {
  const unitName = formatUnit(unit)
  return `${formatArea(applied, unitName)} applied, ${formatArea(remaining, unitName)} remaining`
}
