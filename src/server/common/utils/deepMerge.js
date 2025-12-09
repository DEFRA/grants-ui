/**
 * @typedef {import('./types.js').AnyObject} AnyObject
 */

import { isObject } from './objects.js'
import { deepClone } from './deepClone.js'

/**
 * Deeply merges two plain objects into a new object.
 *
 * Behavior:
 * - If both `target[key]` and `source[key]` are plain objects,
 *   they are merged recursively.
 * - `source[key]` takes precedence over `target[key]`, after being deep-cloned.
 * - Nested arrays / Maps / Sets / plain objects coming from either side
 *   are cloned.
 * - Non-plain objects (class instances, functions, DOM nodes, etc.) are
 *   assigned by reference from `source`.
 *
 * @template T
 * @template S
 * @param {T & AnyObject} target
 * @param {S & AnyObject} source
 * @returns {T & S}
 */
export function deepMerge(target, source) {
  /** @type {AnyObject} */
  const output = deepClone(target)

  if (!isObject(source)) {
    return /** @type {T & S} */ (output)
  }

  for (const key of Object.keys(source)) {
    const sourceValue = source[key]
    const targetValue = output[key]

    if (isObject(sourceValue) && isObject(targetValue)) {
      output[key] = deepMerge(/** @type {AnyObject} */ (targetValue), /** @type {AnyObject} */ (sourceValue))
    } else {
      output[key] = deepClone(sourceValue)
    }
  }

  return /** @type {T & S} */ (output)
}
