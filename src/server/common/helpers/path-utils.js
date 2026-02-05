const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function resolvePathPart(current, part) {
  const arrayMatch = /^(\w+)\[(\d+)\]$/.exec(part)

  if (arrayMatch) {
    const [, arrayName, indexStr] = arrayMatch
    if (FORBIDDEN_KEYS.has(arrayName)) {
      return undefined
    }
    const index = Number.parseInt(indexStr, 10)
    return current?.[arrayName]?.[index]
  }

  if (FORBIDDEN_KEYS.has(part)) {
    return undefined
  }
  if (typeof current === 'object' && part in current) {
    return current[part]
  }
  return undefined
}

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
    current = resolvePathPart(current, part)
  }

  return current
}
