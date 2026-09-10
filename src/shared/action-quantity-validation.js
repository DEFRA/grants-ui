/**
 * One rule set for a land action's quantity input, shared by the server
 * validator and the client-side page script.
 */

import { requiresWholeNumber } from './unit-types.js'

export const QUANTITY_PRECISION = 4

const PLAIN_DECIMAL = /^-?(\d+(\.\d*)?|\.\d+)$/

const NOT_A_NUMBER_MESSAGE = 'Enter a number of hectares, for example 12.5 or 100'

export const QUANTITY_ERRORS = {
  NOT_A_NUMBER: NOT_A_NUMBER_MESSAGE,
  NEGATIVE: NOT_A_NUMBER_MESSAGE,
  NOT_GREATER_THAN_ZERO: 'Enter a number greater than 0',
  NOT_WHOLE_NUMBER: 'Must be a whole number',
  TOO_LARGE: 'Number is too large',
  TOO_MANY_DECIMAL_PLACES: NOT_A_NUMBER_MESSAGE,
  MORE_THAN_AVAILABLE: (max) => `Enter up to ${max} hectares`
}

const WHOLE_NUMBER_QUANTITY_ERRORS = {
  ...QUANTITY_ERRORS,
  NOT_A_NUMBER: 'Must be numbers',
  NEGATIVE: 'Value must be greater than 0',
  NOT_GREATER_THAN_ZERO: 'Value must be greater than 0',
  MORE_THAN_AVAILABLE: () => 'More than available area'
}

/**
 * Normalises a typed quantity for display and submission: trims it, and gives
 * a bare decimal its leading zero (".5" -> "0.5").
 * @param {string | number | null | undefined} raw
 * @returns {string}
 */
export function normaliseQuantityInput(raw) {
  const trimmed = String(raw ?? '').trim()
  if (trimmed.startsWith('.')) {
    return `0${trimmed}`
  }
  if (trimmed.startsWith('-.')) {
    return `-0${trimmed.slice(1)}`
  }
  return trimmed
}

/**
 * Counts the digits after the decimal point of an already-validated plain decimal.
 * @param {string} value
 * @returns {number}
 */
function decimalPlaces(value) {
  return value.split('.')[1]?.length ?? 0
}

/**
 * @param {number} quantity
 * @returns {string | null}
 */
function getWholeNumberError(quantity) {
  if (!Number.isInteger(quantity)) {
    return QUANTITY_ERRORS.NOT_WHOLE_NUMBER
  }
  if (!Number.isSafeInteger(quantity)) {
    return QUANTITY_ERRORS.TOO_LARGE
  }
  return null
}

/**
 * The quantity's fault, or null when it's valid.
 * @param {string | number | null | undefined} raw - Typed value, normalised or not
 * @param {number} [max] - Claimable ceiling; omitted means unrestricted
 * @param {string | null} [unit] - Square metres and counts require whole numbers.
 * @returns {string | null}
 */
export function getQuantityError(raw, max, unit) {
  const value = normaliseQuantityInput(raw)
  const wholeNumber = requiresWholeNumber(unit)
  const errors = wholeNumber ? WHOLE_NUMBER_QUANTITY_ERRORS : QUANTITY_ERRORS

  if (!PLAIN_DECIMAL.test(value)) {
    return errors.NOT_A_NUMBER
  }
  const quantity = Number(value)
  if (quantity < 0) {
    return errors.NEGATIVE
  }
  if (quantity === 0) {
    return errors.NOT_GREATER_THAN_ZERO
  }
  if (wholeNumber) {
    const error = getWholeNumberError(quantity)
    if (error) {
      return error
    }
  } else if (decimalPlaces(value) > QUANTITY_PRECISION) {
    return errors.TOO_MANY_DECIMAL_PLACES
  }
  if (max != null && quantity > max) {
    return errors.MORE_THAN_AVAILABLE(max)
  }
  return null
}

/**
 * Whether a quantity is usable as a claim.
 * @param {string | number | null | undefined} raw
 * @param {number} [max]
 * @param {string | null} [unit]
 * @returns {boolean}
 */
export function isValidQuantity(raw, max, unit) {
  return String(raw ?? '').trim() !== '' && getQuantityError(raw, max, unit) === null
}
