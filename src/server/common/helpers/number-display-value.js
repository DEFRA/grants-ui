import { isDecimalString } from '~/src/shared/format-number.js'

/**
 * @template T
 * @param {T} storedValue
 * @param {unknown} enteredText
 * @returns {T | string}
 */
export function getNumberDisplayValue(storedValue, enteredText) {
  return shouldUseEnteredText(storedValue, enteredText) ? enteredText : storedValue
}

/**
 * @param {unknown} storedValue
 * @param {unknown} enteredText
 * @returns {enteredText is string}
 */
function shouldUseEnteredText(storedValue, enteredText) {
  return (
    isDecimalString(enteredText) &&
    (typeof storedValue === 'number' || isDecimalString(storedValue)) &&
    Number(enteredText) === Number(storedValue)
  )
}
