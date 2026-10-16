/**
 * One rule set for a land action's quantity input, shared by the server
 * validator and the client-side page script.
 */

import { requiresWholeNumber, UNIT_COUNT, UNIT_HECTARES, UNIT_SQUARE_METRES } from './unit-types.js'

export const QUANTITY_PRECISION = 4

const PLAIN_DECIMAL = /^-?(\d+(\.\d*)?|\.\d+)$/

/**
 * Content-designed messages for each unit.
 * @type {Record<string, { INVALID: string, MORE_THAN_AVAILABLE: string }>}
 */
export const QUANTITY_ERRORS = {
  [UNIT_HECTARES]: {
    INVALID: `Enter number of hectares, up to ${QUANTITY_PRECISION} decimal places – for example, 12.3456`,
    MORE_THAN_AVAILABLE: 'Enter a number that is not higher than the available hectares'
  },
  [UNIT_SQUARE_METRES]: {
    INVALID: 'Enter number of square metres, rounded down to the nearest whole number – for example, 234',
    MORE_THAN_AVAILABLE: 'Enter a number that is not higher than the available square metres'
  },
  [UNIT_COUNT]: {
    INVALID: 'Enter number of ponds – for example, 2',
    MORE_THAN_AVAILABLE: 'Enter a number that is not higher than the available ponds'
  }
}

/**
 * The messages for a unit, falling back to hectares for any unit without its own.
 * @param {string | null | undefined} unit
 * @returns {{ INVALID: string, MORE_THAN_AVAILABLE: string }}
 */
export function getQuantityErrors(unit) {
  return QUANTITY_ERRORS[unit ?? UNIT_HECTARES] ?? QUANTITY_ERRORS[UNIT_HECTARES]
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
 * @param {string} value
 * @param {number} quantity
 * @returns {boolean}
 */
function isWholeNumber(value, quantity) {
  // Check the typed fraction too, since Number can round it to an integer.
  return !/\.\d*[1-9]/.test(value) && Number.isSafeInteger(quantity)
}

/**
 * Whether a normalised quantity is a positive number in the unit's precision.
 * @param {string} value
 * @param {boolean} wholeNumber
 * @returns {boolean}
 */
function isWellFormedQuantity(value, wholeNumber) {
  if (!PLAIN_DECIMAL.test(value)) {
    return false
  }
  const quantity = Number(value)
  if (quantity <= 0) {
    return false
  }
  return wholeNumber ? isWholeNumber(value, quantity) : decimalPlaces(value) <= QUANTITY_PRECISION
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
  const errors = getQuantityErrors(unit)

  if (!isWellFormedQuantity(value, requiresWholeNumber(unit))) {
    return errors.INVALID
  }
  if (max != null && Number(value) > max) {
    return errors.MORE_THAN_AVAILABLE
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
