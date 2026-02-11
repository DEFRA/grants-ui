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
