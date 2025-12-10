/**
 * @typedef {import('./types.js').AnyObject} AnyObject
 */

import { isObject } from './objects.js'

/**
 * Handles cloning of arrays with proper handling of circular references
 * @template T
 * @param {Array<T>} array - The array to clone
 * @param {WeakMap<object, any>} seen - Map of already seen objects
 * @returns {Array<T>} A deep clone of the array
 */
function deepCloneArray(array, seen) {
  const arr = []
  seen.set(array, arr)
  for (const item of array) {
    arr.push(deepClone(item, seen))
  }
  return arr
}

/**
 * Handles cloning of Map objects with proper handling of circular references
 * @template K, V
 * @param {Map<K, V>} map - The map to clone
 * @param {WeakMap<object, any>} seen - Map of already seen objects
 * @returns {Map<K, V>} A deep clone of the map
 */
function deepCloneMap(map, seen) {
  const m = new Map()
  seen.set(map, m)
  for (const [k, v] of map.entries()) {
    m.set(deepClone(k, seen), deepClone(v, seen))
  }
  return m
}

/**
 * Handles cloning of Set objects with proper handling of circular references
 * @template T
 * @param {Set<T>} set - The set to clone
 * @param {WeakMap<object, any>} seen - Map of already seen objects
 * @returns {Set<T>} A deep clone of the set
 */
function deepCloneSet(set, seen) {
  const s = new Set()
  seen.set(set, s)
  for (const v of set.values()) {
    s.add(deepClone(v, seen))
  }
  return s
}

/**
 * Handles cloning of plain objects with proper handling of circular references
 * @param {AnyObject} obj - The plain object to clone
 * @param {WeakMap<AnyObject, any>} seen - Map of already seen objects
 * @returns {AnyObject} A deep clone of the object
 */
function deepClonePlainObject(obj, seen) {
  const out = {}
  seen.set(obj, out)
  for (const [k, v] of Object.entries(obj)) {
    out[k] = deepClone(v, seen)
  }
  return out
}

/**
 * Deeply clones a value.
 *
 * Behaviour:
 * - Primitives (`string`, `number`, `boolean`, `null`, `undefined`, `bigint`, `symbol`) are returned as-is.
 * - `Date` → new `Date` with same timestamp.
 * - `Array` → new array with deeply cloned elements.
 * - `Map`   → new `Map` with deeply cloned keys & values.
 * - `Set`   → new `Set` with deeply cloned values.
 * - Plain objects → new object with deeply cloned properties.
 * - Everything else (class instances, functions, DOM nodes, etc.) is returned **by reference**.
 *
 * Circular references are handled via an internal `WeakMap`.
 *
 * @template T
 * @param {T} value
 * @param {WeakMap<object, any>} [seen] internal recursion map, do not pass manually
 * @returns {T}
 */
export function deepClone(value, seen = new WeakMap()) {
  if (value == null || typeof value !== 'object') {
    return value
  }

  const asObj = /** @type {object} */ (value)

  const existing = seen.get(asObj)
  if (existing) {
    return /** @type {T} */ (existing)
  }

  if (Array.isArray(value)) {
    return /** @type {T} */ (deepCloneArray(value, seen))
  }

  if (value instanceof Date) {
    return /** @type {T} */ (new Date(value.getTime()))
  }

  if (value instanceof Map) {
    return /** @type {T} */ (deepCloneMap(value, seen))
  }

  if (value instanceof Set) {
    return /** @type {T} */ (deepCloneSet(value, seen))
  }

  if (isObject(value)) {
    return /** @type {T} */ (deepClonePlainObject(value, seen))
  }

  return value
}
