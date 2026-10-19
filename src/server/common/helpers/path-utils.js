import { reach } from '@hapi/hoek'
import { DANGEROUS_KEYS } from '~/src/server/common/utils/objects.js'

/**
 * Strips the leading `data.` prefix and any `[digit]` array indices from a
 * responseMapping value, producing a plain dot-path for string comparison.
 * e.g. `data.business.countyParishHoldings[0].cphNumber` → `business.countyParishHoldings.cphNumber`
 *
 * @param {string} value
 * @returns {string}
 */
export function normaliseResponseMappingPath(value) {
  return value.replace(/^data\./, '').replaceAll(/\[\d+\]/g, '')
}

/**
 * Resolves a value from an object using dot-notation path
 * Supports array index notation (e.g., 'items[0].name')
 *
 * @param {unknown} obj - Source object
 * @param {string} path - Dot-notation path (e.g., 'foo.bar.baz' or 'items[0].name')
 * @returns {unknown} The resolved value, or undefined if not found
 */
export function resolvePath(obj, path) {
  if (!obj || !path) {
    return undefined
  }

  // Hoek walks array indices as plain segments, so `items[0].name` becomes `items.0.name`.
  // It also counts a negative index from the end of an array, which this path syntax does not.
  const chain = path.replaceAll(/\[(\d+)\]/g, '.$1').split('.')
  if (chain.some((key) => DANGEROUS_KEYS.has(key) || key.startsWith('-'))) {
    return undefined
  }

  // Hoek reads into strings too (`name.0`, `name.length`); only objects are descended.
  return chain.reduce((current, key) => (typeof current === 'object' ? reach(current, [key]) : undefined), obj)
}
