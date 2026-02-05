/**
 * Combines two predicate functions using logical AND
 * @template T
 * @param {function(T): boolean} predicateA
 * @param {function(T): boolean} predicateB
 * @returns {(value: T) => boolean}
 */
export function logicalAnd(predicateA, predicateB) {
  return (value) => predicateA(value) && predicateB(value)
}

/**
 * Inverts the result of a predicate function
 * @template T
 * @param {function(T): boolean} predicate
 * @returns {(value: T) => boolean}
 */
export function logicalNot(predicate) {
  return (value) => !predicate(value)
}
