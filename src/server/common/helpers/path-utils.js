/**
 * Resolves a value from an object using dot-notation path
 * Supports array index notation (e.g., 'items[0].name')
 *
 * @param {object} obj - Source object
 * @param {string} path - Dot-notation path (e.g., 'foo.bar.baz' or 'items[0].name')
 * @returns {any} The resolved value, or undefined if not found
 */
export function resolvePath(obj, path) {
  if (!obj || !path) {
    return undefined
  }

  const parts = path.split('.')
  let current = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }

    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/)

    if (arrayMatch) {
      const [, arrayName, indexStr] = arrayMatch
      const index = parseInt(indexStr, 10)
      current = current?.[arrayName]?.[index]
    } else if (typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      return undefined
    }
  }

  return current
}
