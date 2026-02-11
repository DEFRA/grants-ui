/**
 * @typedef {import('./types.js').AnyObject} AnyObject
 */

/**
 * Determines whether the provided value is an object.
 *
 * @template {AnyObject} T
 * @param {T} value - The value to evaluate.
 * @return {value is T} True if value is an object, false otherwise.
 */
export function isObject(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

/**
 * Determines whether the provided object is empty
 * @param {AnyObject} obj
 * @returns {boolean}
 */
export function isObjectEmpty(obj) {
  return Object.keys(obj).length === 0
}

/**
 * Keys that should never be assigned to prevent prototype pollution
 */
export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Assigns properties from source to target only when they are defined.
 * Includes protection against prototype pollution attacks.
 * @param {object} target - The object to assign properties to
 * @param {object} source - The object to read properties from
 * @param {Record<string, string>} mappings - Map of source keys to target keys
 */
export function assignIfDefined(target, source, mappings) {
  for (const [sourceKey, targetKey] of Object.entries(mappings)) {
    if (DANGEROUS_KEYS.has(targetKey)) {
      continue
    }
    if (source[sourceKey] !== undefined) {
      target[targetKey] = source[sourceKey]
    }
  }
}

/**
 * Performs a deep clone of the provided object, handling nested objects and arrays.
 * @param {object} obj
 * @param {Map} visited - A map to track visited objects for circular reference handling (used internally)
 * @returns {object}
 */
export function deepClone(obj, visited = new Map()) {
  // Handle primitive types and null
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // If we've already cloned this object, return the existing clone
  if (visited.has(obj)) {
    return visited.get(obj)
  }

  // Create a new object or array as the clone
  const clonedObj = Array.isArray(obj) ? [] : {}

  // Store the clone in our visited map before we start recursively cloning properties
  // This allows us to handle circular references
  visited.set(obj, clonedObj)

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      clonedObj[i] = deepClone(obj[i], visited)
    }
  } else {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = deepClone(obj[key], visited)
      }
    }
  }

  return clonedObj
}
