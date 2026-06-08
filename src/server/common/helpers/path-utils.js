import { DANGEROUS_KEYS } from '~/src/server/common/utils/objects.js'

/**
 * @param {unknown} current
 * @param {string} part
 * @returns {unknown}
 */
function resolvePathPart(current, part) {
  const arrayMatch = /^(\w+)\[(\d+)\]$/.exec(part)

  if (arrayMatch) {
    const [, arrayName, indexStr] = arrayMatch
    if (DANGEROUS_KEYS.has(arrayName)) {
      return undefined
    }
    const index = Number.parseInt(indexStr, 10)
    return /** @type {Record<string, unknown[]> | null | undefined} */ (current)?.[arrayName]?.[index]
  }

  if (DANGEROUS_KEYS.has(part)) {
    return undefined
  }
  if (current !== null && typeof current === 'object' && part in current) {
    return /** @type {Record<string, unknown>} */ (current)[part]
  }
  return undefined
}

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

  const parts = path.split('.')
  /** @type {unknown} */
  let current = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = resolvePathPart(current, part)
  }

  return current
}
