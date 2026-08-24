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
