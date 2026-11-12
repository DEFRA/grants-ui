import { formatThousands, isDecimalString } from '~/src/shared/format-number.js'

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf('currency'))

/** @typedef {(value: number | string) => string} NumberFormatter */
/** @type {Map<string, NumberFormatter>} */
const FORMATTERS = new Map()

/**
 * @param {unknown} format
 * @returns {NumberFormatter | undefined}
 */
export function getNumberFormatter(format) {
  if (typeof format !== 'string') {
    return undefined
  }

  const cached = FORMATTERS.get(format)
  if (cached) {
    return cached
  }

  const formatter = createNumberFormatter(format)
  if (formatter) {
    FORMATTERS.set(format, formatter)
  }
  return formatter
}

/**
 * Formats a configured NumberField without changing its stored value.
 * @param {{ type?: string, options?: { format?: string } } | undefined} component
 * @param {unknown} value
 * @param {unknown} [rawInput]
 * @returns {string | undefined} Undefined when no number format applies.
 */
export function formatNumberAnswer(component, value, rawInput) {
  if (component?.type !== 'NumberField') {
    return undefined
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    return ''
  }
  const formatter = getNumberFormatter(component.options?.format)
  if (!formatter) {
    return undefined
  }

  const displayValue =
    isDecimalString(rawInput) &&
    (typeof value === 'number' || isDecimalString(value)) &&
    Number(rawInput) === Number(value)
      ? rawInput
      : value

  return formatter(displayValue)
}

/**
 * @param {string} format
 * @returns {NumberFormatter | undefined}
 */
function createNumberFormatter(format) {
  const parts = format.split(':')
  if (parts.length > 2) {
    return undefined
  }
  const name = parts[0].trim()
  const args = parts.length === 2 ? parts[1].split(',').map((arg) => arg.trim()) : []

  if (name === 'thousands') {
    return args.length === 0 ? formatThousands : undefined
  }
  const options = getIntlFormatOptions(name, args)
  if (!options) {
    return undefined
  }

  const formatter = new Intl.NumberFormat('en-GB', options)
  return (value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return value
    }
    const number = Number(value)
    return Number.isFinite(number) ? formatter.format(number) : String(value)
  }
}

/**
 * @param {string} name
 * @param {string[]} args
 * @returns {Intl.NumberFormatOptions | undefined}
 */
function getIntlFormatOptions(name, args) {
  if (name === 'decimal') {
    if (args.length > 1) {
      return undefined
    }
    const places = args.length ? args[0] : '2'
    return withFractionDigits({ style: 'decimal' }, places)
  }
  if (name !== 'currency' || args.length < 1 || args.length > 2) {
    return undefined
  }

  const currency = args[0].toUpperCase()
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    return undefined
  }

  /** @type {Intl.NumberFormatOptions} */
  const options = { style: 'currency', currency }
  return args.length === 2 ? withFractionDigits(options, args[1]) : options
}

/**
 * @param {Intl.NumberFormatOptions} options
 * @param {string} value
 * @returns {Intl.NumberFormatOptions | undefined}
 */
function withFractionDigits(options, value) {
  const places = Number(value)
  if (!/^\d+$/.test(value) || places > 100) {
    return undefined
  }
  return { ...options, minimumFractionDigits: places, maximumFractionDigits: places }
}
