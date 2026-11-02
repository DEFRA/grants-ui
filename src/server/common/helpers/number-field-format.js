import { formatThousands, isDecimalString } from '~/src/shared/format-number.js'

/**
 * Formats an answer when a NumberField explicitly opts into thousands grouping.
 * @param {{ type?: string, format?: string }} component
 * @param {unknown} value
 * @param {unknown} [rawInput]
 * @returns {string}
 */
export function formatNumberAnswer(component, value, rawInput) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return ''
  }
  if (component.type !== 'NumberField' || component.format !== 'thousands') {
    return String(value)
  }

  if (
    isDecimalString(rawInput) &&
    (typeof value === 'number' || isDecimalString(value)) &&
    Number(rawInput) === Number(value)
  ) {
    return formatThousands(rawInput)
  }
  return formatThousands(value)
}
