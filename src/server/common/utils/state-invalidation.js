/**
 * Returns a patch object with each key in `invalidates` set to undefined,
 * when `previousValue` and `newValue` differ. Returns {} if unchanged.
 * Array comparison is order-insensitive.
 * @param {unknown} previousValue
 * @param {unknown} newValue
 * @param {string[]} invalidates
 * @returns {Record<string, undefined>}
 */
export function buildInvalidatedState(previousValue, newValue, invalidates) {
  if (!invalidates.length || !hasChanged(previousValue, newValue)) {
    return {}
  }
  return Object.fromEntries(invalidates.map((key) => [key, undefined]))
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function hasChanged(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return true
    }
    const sortedA = [...a].sort((x, y) => x.localeCompare(y))
    const sortedB = [...b].sort((x, y) => x.localeCompare(y))
    return sortedA.some((v, i) => v !== sortedB[i])
  }
  return a !== b
}
