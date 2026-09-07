/**
 * One rule set for a land action's quantity input, shared by the server
 * validator and the client-side page script.
 */

export const QUANTITY_PRECISION = 4

const PLAIN_DECIMAL = /^-?(\d+(\.\d*)?|\.\d+)$/

export const QUANTITY_ERRORS = {
  NOT_A_NUMBER: 'Must be numbers',
  NOT_GREATER_THAN_ZERO: 'Value must be greater than 0',
  TOO_MANY_DECIMAL_PLACES: `No more than ${QUANTITY_PRECISION} dp`,
  MORE_THAN_AVAILABLE: 'More than available area'
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
 * The quantity's fault, or null when it's valid.
 * @param {string | number | null | undefined} raw - Typed value, normalised or not
 * @param {number} [max] - Claimable ceiling; omitted means unrestricted
 * @returns {string | null}
 */
export function getQuantityError(raw, max) {
  const value = normaliseQuantityInput(raw)

  if (!PLAIN_DECIMAL.test(value)) {
    return QUANTITY_ERRORS.NOT_A_NUMBER
  }
  if (Number(value) <= 0) {
    return QUANTITY_ERRORS.NOT_GREATER_THAN_ZERO
  }
  if (decimalPlaces(value) > QUANTITY_PRECISION) {
    return QUANTITY_ERRORS.TOO_MANY_DECIMAL_PLACES
  }
  if (max != null && Number(value) > max) {
    return QUANTITY_ERRORS.MORE_THAN_AVAILABLE
  }
  return null
}

/**
 * Whether a quantity is usable as a claim.
 * @param {string | number | null | undefined} raw
 * @param {number} [max]
 * @returns {boolean}
 */
export function isValidQuantity(raw, max) {
  return String(raw ?? '').trim() !== '' && getQuantityError(raw, max) === null
}
