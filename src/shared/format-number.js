const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
const INTEGER_FORMATTER = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const SCIENTIFIC_FORMATTER = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 100 })

/**
 * Formats a number with en-GB thousands grouping while preserving the decimal
 * places supplied by a string value.
 * @param {number | string} value
 * @returns {string}
 */
export function formatThousands(value) {
  const input = String(value)
  if (!NUMBER_PATTERN.test(input)) {
    return input
  }
  if (/[eE]/.test(input)) {
    return SCIENTIFIC_FORMATTER.format(Number(input))
  }

  const sign = input.startsWith('-') || input.startsWith('+') ? input[0] : ''
  const unsigned = sign ? input.slice(1) : input
  const [integerPart, fractionalPart] = unsigned.split('.')
  const groupedInteger = INTEGER_FORMATTER.format(BigInt(integerPart || '0'))
  return `${sign}${groupedInteger}${fractionalPart === undefined ? '' : `.${fractionalPart}`}`
}
