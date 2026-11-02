import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import stringWidth from 'string-width'

// Theme files contain data only. Keep the standard appearance here; personal
// themes belong in the ignored local file or at a path supplied by GT_THEME.
export const DEFAULT_THEME = {
  version: 1,
  title: 'Grants TUI',
  subtitle: 'Grants Platform Toolkit',
  wordmark: [
    '▄▀▀▀  █▀▀▀▄ ▄▀▀▀▄ █▄  █ ▀▀█▀▀ ▄▀▀▀▀    ▀▀█▀▀ █   █ ▀█▀',
    '█  ▄▄ ██▀▀  █▄▄▄█ █ ▀▄█   █    ▀▀▀▄      █   █   █  █',
    '▀▄▄▄▀ █ ▀▀▄ █   █ █   █   █   ▄▄▄▄▀      █   ▀▄▄▄▀ ▄█▄'
  ],
  logo: ['╱╱╱', '╱╱╱', '╱╱╱'],
  colours: {
    accent: 'cyan',
    header: 'green',
    logo: 'magenta',
    heading: 'default',
    text: 'default',
    menuItem: 'default',
    menuSelected: 'cyan',
    local: 'magenta',
    localMuted: 'dim magenta',
    muted: 'dim',
    border: 'dim',
    selected: 'green',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    secondary: 'magenta',
    secondaryMuted: 'dim-magenta',
    link: 'blue'
  },
  symbols: {
    arrow: '❯',
    selected: '◉',
    unselected: '○',
    caret: '▏',
    border: '─',
    mask: '•'
  },
  items: {}
}

/** @typedef {{ arrow?: string, colour?: string, restingColour?: string }} ThemeItem */
/** @typedef {Omit<typeof DEFAULT_THEME, 'items'> & { items: Record<string, ThemeItem> }} Theme */

const NAMED_COLOURS = {
  default: '',
  black: '30',
  red: '31',
  green: '32',
  yellow: '33',
  blue: '34',
  magenta: '35',
  purple: '35',
  cyan: '36',
  white: '37',
  grey: '90',
  gray: '90',
  orange: '38;5;208',
  pink: '38;5;213',
  gold: '38;5;220',
  lime: '38;5;118',
  teal: '38;5;37',
  dim: '2'
}

/** Accept named colours, a 256-colour index, or #rrggbb; never raw escapes. */
function colourCode(value) {
  if (typeof value === 'string') {
    value = value.trim().toLowerCase()
    if (/^dim[ -]/.test(value)) {
      return `2;${colourCode(value.slice(4)) || '39'}`
    }
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255) {
    return `38;5;${value}`
  }
  if (typeof value === 'string' && Object.hasOwn(NAMED_COLOURS, value)) {
    return NAMED_COLOURS[value]
  }
  if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) {
    return `38;2;${[1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16)).join(';')}`
  }
  throw new Error(`Invalid theme colour: ${JSON.stringify(value)}`)
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function text(value, label) {
  // Reject terminal controls, including newlines, so a file cannot inject rows
  // or terminal commands. The renderer supplies all styling itself.
  if (typeof value !== 'string' || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) {
    throw new Error(`${label} must be single-line text without control characters`)
  }
  return value
}

function knownKeys(value, defaults, label) {
  object(value, label)
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(defaults, key)) {
      throw new Error(`Unknown ${label} setting: ${key}`)
    }
  }
}

/**
 * Merge partial files before compiling colours and applying console fallbacks.
 * @param {any} [settings] Untrusted JSON, validated before use.
 * @returns {Theme}
 */
export function resolveTheme(settings = {}, { ansi = false, windows = false } = {}) {
  knownKeys(settings, DEFAULT_THEME, 'theme')
  if (settings.version !== undefined && settings.version !== 1) {
    throw new Error('Unsupported theme version (expected 1)')
  }
  const theme = /** @type {Theme} */ ({ ...DEFAULT_THEME, ...settings })
  for (const key of ['title', 'subtitle']) {
    text(theme[key], key)
  }
  for (const key of ['wordmark', 'logo']) {
    if (!Array.isArray(theme[key]) || theme[key].length !== 3) {
      throw new Error(`${key} must contain exactly three lines`)
    }
    theme[key].forEach((line) => text(line, key))
  }
  knownKeys(settings.colours === undefined ? {} : settings.colours, DEFAULT_THEME.colours, 'colour')
  const palette = { ...DEFAULT_THEME.colours, ...settings.colours }
  const compileColour = (value) => {
    const code = colourCode(value)
    return ansi && code ? `\x1b[${code}m` : ''
  }
  theme.colours = /** @type {typeof DEFAULT_THEME.colours} */ (
    Object.fromEntries(Object.entries(palette).map(([key, value]) => [key, compileColour(value)]))
  )
  knownKeys(settings.symbols === undefined ? {} : settings.symbols, DEFAULT_THEME.symbols, 'symbol')
  theme.symbols = { ...DEFAULT_THEME.symbols, ...settings.symbols }
  for (const [key, value] of Object.entries(theme.symbols)) {
    if (!stringWidth(text(value, key)) || (key === 'border' && stringWidth(value) !== 1)) {
      throw new Error(`${key} must occupy ${key === 'border' ? 'one terminal column' : 'at least one terminal column'}`)
    }
  }
  theme.items = Object.fromEntries(
    Object.entries(object(settings.items === undefined ? {} : settings.items, 'items')).map(([key, value]) => {
      knownKeys(value, { arrow: '', colour: '', restingColour: '' }, `item ${key}`)
      const item = { ...value }
      if (item.arrow !== undefined && !stringWidth(text(item.arrow, `item ${key} arrow`))) {
        throw new Error(`Item ${key} arrow must occupy at least one terminal column`)
      }
      for (const name of ['colour', 'restingColour']) {
        if (item[name] !== undefined) {
          item[name] = compileColour(item[name])
        }
      }
      return [key, item]
    })
  )
  if (windows) {
    theme.symbols = { arrow: '>', selected: '[x]', unselected: '[ ]', caret: '|', border: '-', mask: '*' }
    theme.items = Object.fromEntries(Object.entries(theme.items).map(([key, item]) => [key, { ...item, arrow: '>' }]))
  }
  return theme
}

/** Paths are relative to the checkout, so `gt` behaves the same from any cwd. */
export function loadTheme({ root, selection = '', ansi = false, windows = false }) {
  if (selection === 'default') {
    return resolveTheme({}, { ansi, windows })
  }
  const filename = resolve(root, selection || '.grants-ui-cli-theme.json')
  try {
    const settings = JSON.parse(readFileSync(filename, 'utf8'))
    return resolveTheme(settings, { ansi, windows })
  } catch {
    return resolveTheme({}, { ansi, windows })
  }
}
