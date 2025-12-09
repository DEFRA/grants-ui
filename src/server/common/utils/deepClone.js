/**
 * @typedef {import('./types.js').AnyObject} AnyObject
 */

import { isObject } from './objects.js'

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
  if (value === null || typeof value !== 'object') {
    return value
  }

  const asObj = /** @type {object} */ (value)

  const existing = seen.get(asObj)
  if (existing) {
    return /** @type {T} */ (existing)
  }

  if (Array.isArray(value)) {
    const arr = []
    seen.set(asObj, arr)
    for (const item of value) {
      arr.push(deepClone(item, seen))
    }
    return /** @type {T} */ (arr)
  }

  if (value instanceof Date) {
    return /** @type {T} */ (new Date(value.getTime()))
  }

  if (value instanceof Map) {
    const m = new Map()
    seen.set(asObj, m)
    for (const [k, v] of value.entries()) {
      m.set(deepClone(k, seen), deepClone(v, seen))
    }
    return /** @type {T} */ (m)
  }

  if (value instanceof Set) {
    const s = new Set()
    seen.set(asObj, s)
    for (const v of value.values()) {
      s.add(deepClone(v, seen))
    }
    return /** @type {T} */ (s)
  }

  if (isObject(value)) {
    /** @type {AnyObject} */
    const out = {}
    seen.set(asObj, out)
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepClone(v, seen)
    }
    return /** @type {T} */ (out)
  }

  return value
}
