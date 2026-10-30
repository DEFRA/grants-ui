import { formatThousands } from '~/src/shared/format-number.js'

const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/

/**
 * Formats an answer when a NumberField explicitly opts into thousands grouping.
 * @param {{ type?: string, format?: string }} component
 * @param {unknown} value
 * @param {unknown} [rawInput]
 * @returns {string}
 */
export function formatNumberAnswer(component, value, rawInput) {
  if (value === null || value === undefined) {
    return ''
  }
  if (component.type !== 'NumberField' || component.format !== 'thousands') {
    return String(value)
  }

  const valueNumber =
    typeof value === 'number' || (typeof value === 'string' && NUMBER_PATTERN.test(value)) ? Number(value) : NaN
  const rawIsValid = typeof rawInput === 'string' && NUMBER_PATTERN.test(rawInput)
  const input = rawIsValid && Number(rawInput) === valueNumber ? rawInput : value
  return formatThousands(typeof input === 'number' || typeof input === 'string' ? input : String(input))
}
