import { isStrictObject } from './isStrictObject.js'

/**
 * Deeply merges two objects by recursively combining their properties
 *
 * @param {object} target - The target object that will receive properties
 * @param {object} source - The source object whose properties will be merged into the target
 * @returns {object }A new object containing the merged properties of both inputs
 *
 * @example
 * const obj1 = { a: 1, b: { c: 2 } };
 * const obj2 = { b: { d: 3 }, e: 4 };
 * const result = deepMerge(obj1, obj2);
 * // result: { a: 1, b: { c: 2, d: 3 }, e: 4 }
 */
export function deepMerge(target, source) {
  const output = { ...target }

  if (isStrictObject(source)) {
    Object.keys(source).forEach((key) => {
      const sourceValue = source[key]
      const targetValue = target[key]

      if (isStrictObject(sourceValue) && isStrictObject(targetValue)) {
        output[key] = deepMerge(targetValue, sourceValue)
      } else {
        output[key] = sourceValue
      }
    })
  }

  return output
}
