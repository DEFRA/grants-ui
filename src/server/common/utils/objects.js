/**
 * Determines whether the provided value is an object.
 *
 * @template T
 * @param {import('./types.js').AnyObject | T } value - The value to evaluate.
 * @return {value is T} True if value is an object, false otherwise.
 */
export function isObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

/**
 * Determines whether the provided object is empty
 * @param {import('./types.js').AnyObject} obj
 * @returns {boolean}
 */
export function isObjectEmpty(obj) {
  return Object.keys(obj).length === 0
}
