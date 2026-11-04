import { isDecimalString } from '~/src/shared/format-number.js'
import { getNumberFormatter } from './number-formatter.js'

/**
 * @param {unknown} format
 * @returns {format is string}
 */
export function isNumberFormat(format) {
  return Boolean(getNumberFormatter(format))
}

/**
 * Formats a NumberField answer for playback without changing its stored value.
 * @param {{ type?: string, schema?: { format?: string } }} component
 * @param {unknown} value
 * @param {unknown} [rawInput]
 * @returns {string}
 */
export function formatNumberAnswer(component, value, rawInput) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return ''
  }
  const formatter = component.type === 'NumberField' ? getNumberFormatter(component.schema?.format) : undefined
  if (!formatter) {
    return String(value)
  }

  const displayValue =
    isDecimalString(rawInput) &&
    (typeof value === 'number' || isDecimalString(value)) &&
    Number(rawInput) === Number(value)
      ? rawInput
      : value

  return formatter(displayValue)
}
