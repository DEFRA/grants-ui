const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
const INTEGER_FORMATTER = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

/**
 * @param {Intl.LocalesArgument} locale
 * @param {string} currency
 * @param {Pick<Intl.NumberFormatOptions, 'minimumFractionDigits' | 'maximumFractionDigits'>} [fractionDigits]
 */
export function createCurrencyNumberFormat(locale, currency, fractionDigits) {
  /** @type {Intl.NumberFormatOptions & { trailingZeroDisplay: 'stripIfInteger' }} */
  const options = { ...fractionDigits, style: 'currency', currency, trailingZeroDisplay: 'stripIfInteger' }
  return new Intl.NumberFormat(locale, options)
}

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
 * @param {number | string | null | undefined} value
 * @returns {string}
 */
export function formatThousands(value) {
  const input = String(value ?? '')
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
