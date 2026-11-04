import { formatThousands, isDecimalString } from '~/src/shared/format-number.js'

/** @type {Record<string, Intl.NumberFormat>} */
const NUMBER_FORMATTERS = {
  percent: new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 2 }),
  decimal: new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  'currency-gbp': new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
}

/**
 * @param {unknown} format
 * @returns {format is string}
 */
export function isNumberFormat(format) {
  return typeof format === 'string' && (format === 'thousands' || Object.hasOwn(NUMBER_FORMATTERS, format))
}

/**
 * Formats a NumberField answer for playback without changing its stored value.
 * @param {{ type?: string, format?: string }} component
 * @param {unknown} value
 * @param {unknown} [rawInput]
 * @returns {string}
 */
export function formatNumberAnswer(component, value, rawInput) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return ''
  }
  if (component.type !== 'NumberField' || !isNumberFormat(component.format)) {
    return String(value)
  }

  const displayValue =
    isDecimalString(rawInput) &&
    (typeof value === 'number' || isDecimalString(value)) &&
    Number(rawInput) === Number(value)
      ? rawInput
      : value

  return component.format === 'thousands'
    ? formatThousands(displayValue)
    : NUMBER_FORMATTERS[component.format].format(Number(displayValue))
}
