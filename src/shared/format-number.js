const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
const INTEGER_FORMATTER = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isDecimalString(value) {
  return typeof value === 'string' && NUMBER_PATTERN.test(value)
}

/**
 * Formats a number with en-GB thousands grouping while preserving the decimal
 * places supplied by a string value.
 * @param {number | string} value
 * @returns {string}
 */
export function formatThousands(value) {
  const input = String(value)
  if (!isDecimalString(input)) {
    return input
  }

  const sign = input.startsWith('-') || input.startsWith('+') ? input[0] : ''
  const unsigned = sign ? input.slice(1) : input
  const [integerPart, ...fraction] = unsigned.split('.')
  const groupedInteger = INTEGER_FORMATTER.format(BigInt(integerPart || '0'))
  return [sign + groupedInteger, ...fraction].join('.')
}

/**
 * Group the numeric part of a payment quantity, preserving any supplied unit.
 * @param {number | string} quantity
 */
export function formatActionQuantity(quantity) {
  return String(quantity).replace(/^\S+/, formatThousands)
}
