import { createCurrencyNumberFormat, formatThousands } from '~/src/shared/format-number.js'

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf('currency'))

/** @typedef {{ suffix?: string }} NumberFormatOptions */
/** @typedef {(value: number | string) => string} BaseNumberFormatter */
/** @typedef {(value: number | string, options?: NumberFormatOptions) => string} NumberFormatter */
/** @typedef {(args: string[]) => BaseNumberFormatter | undefined} BaseNumberFormatterFactory */
/** @typedef {(formatter: BaseNumberFormatter) => NumberFormatter} NumberModifier */

/** @type {Map<string, BaseNumberFormatterFactory>} */
const BASE_FORMATTER_FACTORIES = new Map([
  ['thousands', (args) => (args.length === 0 ? formatThousands : undefined)],
  ['decimal', createDecimalFormatter],
  ['currency', createCurrencyFormatter]
])

/** @type {Map<string, NumberModifier>} */
const MODIFIERS = new Map([['suffix', withSuffix]])

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
 * Formats a configured NumberField's display value.
 * @param {{ type?: string, options?: { format?: string, suffix?: string } } | undefined} component
 * @param {unknown} value
 * @returns {string | undefined} Undefined when no number format applies.
 */
export function formatNumberAnswer(component, value) {
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

  return formatter(value, component.options)
}

/**
 * Parses `<base>`, `<base>|<modifier>` or `<modifier>`, where a modifier on its
 * own applies to the unformatted value.
 * @param {string} format
 * @returns {NumberFormatter | undefined}
 */
function createNumberFormatter(format) {
  const parts = format.split('|').map((part) => part.trim())
  const [base, modifier, ...rest] = MODIFIERS.has(parts[0]) ? [undefined, ...parts] : parts
  if (rest.length > 0) {
    return undefined
  }

  const formatter = base === undefined ? String : createBaseFormatter(base)
  if (!formatter || modifier === undefined) {
    return formatter
  }
  return MODIFIERS.get(modifier)?.(formatter)
}

/**
 * @param {string} format
 * @returns {BaseNumberFormatter | undefined}
 */
function createBaseFormatter(format) {
  const stage = parseFormatStage(format)
  return stage ? BASE_FORMATTER_FACTORIES.get(stage.name)?.(stage.args) : undefined
}

/**
 * @param {string} format
 * @returns {{ name: string, args: string[] } | undefined}
 */
function parseFormatStage(format) {
  const parts = format.split(':')
  if (parts.length > 2) {
    return undefined
  }
  return {
    name: parts[0].trim(),
    args: parts.length === 2 ? parts[1].split(',').map((arg) => arg.trim()) : []
  }
}

/**
 * @param {BaseNumberFormatter} formatter
 * @returns {NumberFormatter}
 */
function withSuffix(formatter) {
  return (value, options) => {
    const suffix = options?.suffix
    const formatted = formatter(value)
    return suffix && formatted.trim() !== '' && Number.isFinite(Number(value)) ? formatted + suffix : formatted
  }
}

/**
 * @param {string[]} args
 * @returns {BaseNumberFormatter | undefined}
 */
function createDecimalFormatter(args) {
  if (args.length > 1) {
    return undefined
  }
  const fractionDigits = resolveFractionDigits(args[0] ?? '2')
  return fractionDigits ? formatFiniteNumber(new Intl.NumberFormat('en-GB', fractionDigits)) : undefined
}

/**
 * @param {string[]} args
 * @returns {BaseNumberFormatter | undefined}
 */
function createCurrencyFormatter(args) {
  if (args.length < 1 || args.length > 2) {
    return undefined
  }

  const currency = args[0].toUpperCase()
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    return undefined
  }

  const fractionDigits = args.length === 2 ? resolveFractionDigits(args[1]) : {}
  return fractionDigits ? formatFiniteNumber(createCurrencyNumberFormat('en-GB', currency, fractionDigits)) : undefined
}

/**
 * @param {Intl.NumberFormat} formatter
 * @returns {BaseNumberFormatter}
 */
function formatFiniteNumber(formatter) {
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
 */
function resolveFractionDigits(value) {
  const places = Number(value)
  if (!/^\d+$/.test(value) || places > 100) {
    return undefined
  }
  return { minimumFractionDigits: places, maximumFractionDigits: places }
}
