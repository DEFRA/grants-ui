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
  const src = /** @type {Record<string, unknown>} */ (source)
  const tgt = /** @type {Record<string, unknown>} */ (target)
  for (const [sourceKey, targetKey] of Object.entries(mappings)) {
    if (DANGEROUS_KEYS.has(targetKey)) {
      continue
    }
    if (src[sourceKey] !== undefined) {
      tgt[targetKey] = src[sourceKey]
    }
  }
}

/**
 * Normalises a state collection (array or object keyed by id) into an array of
 * its items so callers can iterate uniformly.
 *
 * @param {unknown} collection - The collection value read from form state.
 * @returns {unknown[]} The collection's items, or an empty array.
 */
function resolveCollectionItems(collection) {
  if (Array.isArray(collection)) {
    return collection
  }

  if (collection && typeof collection === 'object') {
    return Object.values(collection)
  }

  return []
}

/**
 * Determines whether a state collection contains at least one item that has a
 * non-empty value at the given key. The collection may be stored either as an
 * array of items or as an object keyed by id; in both cases each item is
 * inspected. A value counts as "non-empty" when it is a non-empty array or an
 * object with at least one own key.
 *
 * @param {unknown} collection - The collection value read from form state.
 * @param {string} key - The property each item must populate to count.
 * @returns {boolean} `true` if any item has a non-empty value at `key`.
 */
export function hasAnyItemWithNonEmptyKey(collection, key) {
  const items = resolveCollectionItems(collection)

  return items.some((item) => {
    if (!item || typeof item !== 'object') {
      return false
    }

    const value = item[key]

    if (Array.isArray(value)) {
      return value.length > 0
    }

    return Boolean(value) && typeof value === 'object' && Object.keys(/** @type {object} */ (value)).length > 0
  })
}
