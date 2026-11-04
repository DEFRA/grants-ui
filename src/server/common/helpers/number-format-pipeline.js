import { formatThousands } from '~/src/shared/format-number.js'

const LOCALE = 'en-GB'
const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf('currency'))
const PIPELINE_FORMATTERS = new Map()

/**
 * @typedef {{ name: 'thousands' | 'decimal' | 'percent' | 'currency', places?: number, currency?: string }} Stage
 * @typedef {{ formatter: Intl.NumberFormat, replaceDecoration: boolean }} CompiledStage
 * @typedef {{ value: string, prefix: string, suffix: string }} NumberState
 */

/**
 * @param {unknown} format
 * @returns {((value: number | string) => string) | undefined}
 */
export function getNumberFormatter(format) {
  if (typeof format !== 'string') {
    return undefined
  }

  const cached = PIPELINE_FORMATTERS.get(format)
  if (cached) {
    return cached
  }

  const compiledStages = compilePipeline(format)
  if (!compiledStages) {
    return undefined
  }

  const formatter = (value) => render(compiledStages, value)
  PIPELINE_FORMATTERS.set(format, formatter)
  return formatter
}

/**
 * @param {string} format
 * @returns {CompiledStage[] | undefined}
 */
function compilePipeline(format) {
  const stages = parsePipeline(format)
  if (!stages) {
    return undefined
  }

  let inheritedPlaces
  const compiledStages = []
  for (const stage of stages) {
    const compiled = compileStage(stage, inheritedPlaces)
    if (compiled) {
      compiledStages.push(compiled)
    }
    if (stage.name === 'decimal') {
      inheritedPlaces = stage.places ?? 2
    } else if (stage.places !== undefined) {
      inheritedPlaces = stage.places
    }
  }
  return compiledStages
}

/**
 * @param {string} format
 * @returns {Stage[] | undefined}
 */
function parsePipeline(format) {
  const stageTexts = format.split('|')

  /** @type {Stage[]} */
  const stages = []
  for (const stageText of stageTexts) {
    const text = stageText.trim()
    if (!text) {
      return undefined
    }

    const colon = text.indexOf(':')
    if (colon !== text.lastIndexOf(':')) {
      return undefined
    }

    const name = (colon === -1 ? text : text.slice(0, colon)).trim()
    const argumentText = colon === -1 ? undefined : text.slice(colon + 1).trim()
    if (!name) {
      return undefined
    }

    const args = argumentText === undefined ? [] : argumentText.split(',').map((arg) => arg.trim())
    if (args.some((arg) => !arg)) {
      return undefined
    }

    if (name === 'thousands') {
      if (args.length > 0) {
        return undefined
      }
      stages.push({ name })
      continue
    }

    if (name === 'decimal' || name === 'percent') {
      if (args.length > 1) {
        return undefined
      }
      const places = args.length === 1 ? parsePlaces(args[0]) : undefined
      if (args.length === 1 && places === undefined) {
        return undefined
      }
      stages.push({ name, ...(places === undefined ? {} : { places }) })
      continue
    }

    if (name === 'currency') {
      if (args.length < 1 || args.length > 2 || !/^[a-zA-Z]{3}$/.test(args[0])) {
        return undefined
      }
      const currency = args[0].toUpperCase()
      if (!SUPPORTED_CURRENCIES.has(currency)) {
        return undefined
      }
      const places = args.length === 2 ? parsePlaces(args[1]) : undefined
      if (args.length === 2 && places === undefined) {
        return undefined
      }
      stages.push({ name, currency, ...(places === undefined ? {} : { places }) })
      continue
    }

    return undefined
  }

  return stages
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

/**
 * @param {Stage} stage
 * @param {number | undefined} inheritedPlaces
 * @returns {CompiledStage | undefined}
 */
function compileStage(stage, inheritedPlaces) {
  if (stage.name === 'thousands') {
    return undefined
  }

  /** @type {Intl.NumberFormatOptions} */
  const options = {
    useGrouping: false,
    style: stage.name === 'currency' ? 'currency' : stage.name
  }

  if (stage.name === 'currency') {
    options.currency = stage.currency
  }
  const places = stage.name === 'decimal' ? (stage.places ?? 2) : (stage.places ?? inheritedPlaces)
  if (places !== undefined) {
    options.minimumFractionDigits = places
    options.maximumFractionDigits = places
  } else if (stage.name === 'percent') {
    options.maximumFractionDigits = 2
  }

  return {
    formatter: new Intl.NumberFormat(LOCALE, options),
    replaceDecoration: stage.name === 'currency' || stage.name === 'percent'
  }
}

/**
 * @param {CompiledStage[]} stages
 * @param {number | string} value
 * @returns {string}
 */
function render(stages, value) {
  if (typeof value === 'string' && value.trim() === '') {
    return value
  }

  const numericValue = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(numericValue)) {
    return String(value)
  }

  /** @type {NumberState} */
  const state = {
    value: typeof value === 'number' && Object.is(value, -0) && stages.length ? '-0' : String(value),
    prefix: '',
    suffix: ''
  }

  for (const stage of stages) {
    const parts = stage.formatter.formatToParts(Number(state.value))
    const formatted = parseNumberParts(parts)
    if (!formatted) {
      return String(value)
    }

    state.value = formatted.value
    if (stage.replaceDecoration) {
      state.prefix = formatted.prefix
      state.suffix = formatted.suffix
    }
  }

  const groupedValue = formatThousands(state.value)
  const sign = groupedValue.startsWith('-') || groupedValue.startsWith('+') ? groupedValue[0] : ''
  const unsignedValue = sign ? groupedValue.slice(1) : groupedValue
  return `${sign}${state.prefix}${unsignedValue}${state.suffix}`
}

/**
 * @param {Intl.NumberFormatPart[]} parts
 * @returns {NumberState | undefined}
 */
function parseNumberParts(parts) {
  let value = ''
  let prefix = ''
  let suffix = ''
  let numberStarted = false

  for (const part of parts) {
    if (part.type === 'integer' || part.type === 'decimal' || part.type === 'fraction') {
      value += part.value
      numberStarted = true
      continue
    }

    if (part.type === 'minusSign' || part.type === 'plusSign') {
      value += part.value
      continue
    }

    if (numberStarted) {
      suffix += part.value
    } else {
      prefix += part.value
    }
  }

  return numberStarted ? { value, prefix, suffix } : undefined
}
