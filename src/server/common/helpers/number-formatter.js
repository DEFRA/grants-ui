import { formatThousands } from '~/src/shared/format-number.js'

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf('currency'))

/** @typedef {(value: number | string) => string} NumberFormatter */
/** @type {Map<string, NumberFormatter>} */
const FORMATTERS = new Map()

/**
 * @param {unknown} format
 * @returns {NumberFormatter | undefined}
 */
export function getNumberFormatter(format) {
  if (typeof format !== 'string' || format.includes('|')) {
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
  if (args.some((arg) => !arg)) {
    return undefined
  }

  if (name === 'thousands') {
    return args.length === 0 ? formatThousands : undefined
  }
  if (name !== 'decimal' && name !== 'currency') {
    return undefined
  }
  if (args.length > (name === 'currency' ? 2 : 1)) {
    return undefined
  }

  const currency = name === 'currency' ? args[0]?.toUpperCase() : undefined
  if (name === 'currency' && (!currency || !/^[A-Z]{3}$/.test(currency) || !SUPPORTED_CURRENCIES.has(currency))) {
    return undefined
  }

  const placesArg = args[name === 'currency' ? 1 : 0]
  const places = placesArg === undefined ? undefined : parsePlaces(placesArg)
  if (placesArg !== undefined && places === undefined) {
    return undefined
  }

  /** @type {Intl.NumberFormatOptions} */
  const options = { style: name }
  if (name === 'currency') {
    options.currency = currency
  }
  const fractionDigits = places ?? (name === 'decimal' ? 2 : undefined)
  if (fractionDigits !== undefined) {
    options.minimumFractionDigits = fractionDigits
    options.maximumFractionDigits = fractionDigits
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
 * @param {string} value
 * @returns {number | undefined}
 */
function parsePlaces(value) {
  if (!/^\d+$/.test(value)) {
    return undefined
  }
  const places = Number(value)
  return places <= 100 ? places : undefined
}
