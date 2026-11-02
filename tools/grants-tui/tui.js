/* eslint-disable curly, no-control-regex */

import * as readline from 'node:readline'
import { stripVTControlCharacters } from 'node:util'
import stringWidth from 'string-width'

import {
  ACCENT,
  ARROW,
  BOLD,
  CIRCLE,
  CLEAR_SCREEN,
  DIM,
  HIDE_CURSOR,
  INVERSE,
  IS_WINDOWS,
  KEYS,
  RESET_COLOR,
  SHOW_CURSOR,
  THEME,
  TICK,
  VERSION
} from './constants.js'

const { colours, symbols } = THEME
// All selection markers share a column, including per-item overrides with a
// different display width. UTF-16 length does not measure terminal columns.
const ARROW_WIDTH = Math.max(
  visibleLen(ARROW),
  ...Object.values(THEME.items).map((item) => visibleLen(item.arrow ?? ARROW))
)
const TOGGLE_WIDTH = Math.max(visibleLen(TICK), visibleLen(CIRCLE))

function itemTheme(key = '') {
  return Object.hasOwn(THEME.items, key) ? THEME.items[key] : {}
}

function selectionArrow(active, key = '', colour = ACCENT) {
  const marker = itemTheme(key).arrow ?? ARROW
  return active ? `${colour}${padVisible(marker, ARROW_WIDTH)}${RESET_COLOR}` : ' '.repeat(ARROW_WIDTH)
}

function menuColours(item) {
  const style = itemTheme(item.key)
  const local = item.key === 'local' || item.key === 'refresh-overrides'
  return {
    active: item.colour ?? style.colour ?? (local ? colours.local : colours.menuSelected),
    resting:
      item.colour ??
      style.restingColour ??
      (item.key === 'refresh-overrides' ? colours.localMuted : local ? colours.local : colours.menuItem)
  }
}

/**
 * Length of a string ignoring ANSI colour escapes, so padding maths line up.
 * @param {string} str
 * @returns {number}
 */
export function visibleLen(str) {
  return stringWidth(str)
}

/**
 * Right-pad a string to `width` visible columns (ANSI escapes don't count).
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
export function padVisible(str, width) {
  const pad = width - visibleLen(str)
  return pad > 0 ? str + ' '.repeat(pad) : str
}

/** Keep single-line menu rows inside the terminal without losing their colours. */
export function truncateVisible(str, width) {
  if (visibleLen(str) <= width) return str
  let length = 0
  let result = ''
  for (const token of displayTokens(str)) {
    const tokenWidth = visibleLen(token)
    if (length + tokenWidth > width - 1) break
    result += token
    length += tokenWidth
  }
  return result + '…' + RESET_COLOR
}

// Split visible text into graphemes while preserving ANSI styling sequences.
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
function displayTokens(str) {
  return str
    .split(/(\x1b\[[0-9;]*m)/g)
    .flatMap((part) =>
      part.startsWith('\x1b') ? [part] : Array.from(graphemes.segment(part), ({ segment }) => segment)
    )
}

// ---------------------------------------------------------------------------
// Shared screen renderer
// ---------------------------------------------------------------------------

// Half-block glyphs are unreliable on legacy Windows consoles, so fall back to a
// plain single-line title there.
export const HEADER = IS_WINDOWS
  ? [
      '',
      `  ${BOLD}${colours.header}${THEME.title}${RESET_COLOR}  ${DIM}v${VERSION}${RESET_COLOR}`,
      `  ${colours.border}${symbols.border.repeat(40)}${RESET_COLOR}`,
      ''
    ]
  : [
      '',
      ...THEME.wordmark.map(
        (line, index) =>
          `  ${colours.logo}${THEME.logo[index]}${RESET_COLOR}  ${BOLD}${colours.header}${line}${RESET_COLOR}`
      ),
      `  ${DIM}${THEME.subtitle} · v${VERSION}${RESET_COLOR}`,
      ''
    ]

let runtimeStatusLine = ''
let commandStatusLine = ''

/** Shared by menus and prompts so runtime information stays visible throughout the TUI. */
export function setRuntimeStatusLine(line) {
  runtimeStatusLine = line
}

/** Wrap the runtime footer without splitting ANSI escapes or dropping address text. */
function runtimeRows() {
  if (!runtimeStatusLine) return []
  const width = Math.max(1, (process.stdout.columns || 100) - 1)
  const indent = ' '.repeat(Math.min(2, width - 1))
  const contentWidth = width - indent.length
  const rows = []
  let row = indent
  let length = 0
  for (const token of displayTokens(runtimeStatusLine)) {
    if (token.startsWith('\x1b')) {
      row += token
      continue
    }
    if (length + visibleLen(token) > contentWidth) {
      rows.push(row)
      row = indent
      length = 0
    }
    row += token
    length += visibleLen(token)
  }
  rows.push(row)
  return rows
}

function menuCapacity() {
  const footerRows = runtimeRows().length
  return Math.max(1, (process.stdout.rows || 24) - HEADER.length - 7 - (footerRows ? footerRows + 1 : 0))
}

function screenLines(bodyLines, statusLine) {
  const width = Math.max(1, (process.stdout.columns || 100) - 1)
  const footer = runtimeStatusLine
    ? [
        '',
        `  ${statusLine || `${DIM}Ready${RESET_COLOR}`}`,
        `  ${colours.border}${symbols.border.repeat(Math.max(1, width - 2))}${RESET_COLOR}`,
        ...runtimeRows()
      ]
    : statusLine
      ? ['', `  ${statusLine}`]
      : []
  const padding = runtimeStatusLine
    ? Math.max(0, (process.stdout.rows || 24) - HEADER.length - bodyLines.length - footer.length - 1)
    : 0
  return [...HEADER, ...bodyLines, ...Array(padding).fill(''), ...footer, ''].map((line) =>
    truncateVisible(line, width)
  )
}
/**
 * Clear the screen and draw the header followed by the given body lines.
 * @param {string[]} bodyLines
 * @param {string} [statusLine]
 * @returns {void}
 */
export function renderScreen(bodyLines, statusLine = commandStatusLine) {
  commandStatusLine = statusLine
  const lines = screenLines(bodyLines, statusLine)
  process.stdout.write(HIDE_CURSOR + CLEAR_SCREEN + lines.join('\n'))
}

/** Shared layout for the selectable menu and its disabled running state. */
function radioMenuBody(items, title, hint, cursor, arrowThemeKey) {
  const labelWidth = Math.max(...items.map((item) => visibleLen(item.label))) + 2
  const body = [`  ${colours.heading}${BOLD}${title}${RESET_COLOR}`, `  ${DIM}${hint}${RESET_COLOR}`, '']
  items.forEach((item, index) => {
    const active = index === cursor && !item.disabled
    const style = menuColours(item)
    const arrow = selectionArrow(active, arrowThemeKey ?? item.key, style.active)
    const labelColour = item.disabled ? DIM : active ? `${style.active}${BOLD}` : style.resting
    const label = padVisible(`${labelColour}${item.label}${RESET_COLOR}`, labelWidth)
    body.push(`  ${arrow}  ${label}  ${DIM}${item.description}${RESET_COLOR}`)
  })
  return body
}

/** A soft white highlight travels left to right, with a gap between sweeps. */
export function shimmerText(text, frame, enabled = true) {
  if (!enabled) return text
  const chars = Array.from(text)
  const centre = (frame % (chars.length + 16)) - 8
  return (
    chars
      .map((char, index) => {
        const brightness = Math.round(205 + 50 * Math.max(0, 1 - Math.abs(index - centre) / 5))
        return `\x1b[38;2;${brightness};${brightness};${brightness}m${char}`
      })
      .join('') + '\x1b[0m'
  )
}

/** Keep consuming input while busy so navigation cannot queue up for later. */
export function showBusyMenu(items, message, cancel, animate = true, title = 'What do you want to do?') {
  let frame = 0
  let cancelling = false
  let statusRow = 1
  const width = () => Math.max(1, (process.stdout.columns || 100) - 3)
  const status = () =>
    shimmerText(
      stripVTControlCharacters(truncateVisible(cancelling ? 'Cancelling…' : message, width())),
      frame++,
      animate
    )
  const draw = () => {
    const maxItems = menuCapacity()
    const body = radioMenuBody(
      items.slice(0, maxItems).map((item) => ({ ...item, disabled: true })),
      title,
      'Running — menu disabled    ctrl+c → cancel',
      -1
    )
    if (items.length > maxItems) body.push(`     … ${items.length - maxItems} more actions`)
    const menu = body.map((line) => `${DIM}${truncateVisible(stripVTControlCharacters(line), width())}${RESET_COLOR}`)
    const lines = screenLines(menu, status())
    statusRow = lines.length - (runtimeStatusLine ? runtimeRows().length + 2 : 1)
    process.stdout.write(HIDE_CURSOR + CLEAR_SCREEN + lines.slice(0, -1).join('\n'))
  }
  draw()
  // Redraw only the status row between frames, avoiding a whole-screen flash.
  const timer = animate
    ? setInterval(() => {
        process.stdout.write(`\x1b[${statusRow};1H\x1b[2K  ${status()}`)
      }, 45)
    : undefined
  function onKey(_, key) {
    if (key?.sequence !== KEYS.CTRL_C || cancelling) return
    cancelling = true
    cancel()
    draw()
  }
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) process.stdin.setRawMode(true)
  process.stdin.on('keypress', onKey)
  process.stdout.on('resize', draw)
  const stop = () => {
    clearInterval(timer)
    process.stdout.removeListener('resize', draw)
    makeCleanup(onKey)()
  }
  stop.update = (nextMessage) => {
    if (cancelling || nextMessage === message) return
    message = nextMessage
    // The next animation frame picks up the latest phase, coalescing bursts of log lines.
    if (!animate) draw()
  }
  return stop
}

/**
 * Build a keypress-listener teardown for a menu: detach the handler, leave raw
 * mode, and restore the cursor. Shared by radioMenu and toggleMenu.
 * @param {(str: string, key: import('node:readline').Key) => void} onKey
 * @returns {() => void}
 */
function makeCleanup(onKey) {
  return function cleanup() {
    process.stdin.removeListener('keypress', onKey)
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdout.write(SHOW_CURSOR)
  }
}

// ---------------------------------------------------------------------------
// Radio menu (command selection)
// ---------------------------------------------------------------------------

/**
 * Single-select menu. Draws `items`, handles arrow/enter/esc keys, and resolves
 * with the chosen item's `key` — or `'__quit__'` on esc / ctrl-c. When
 * `gasEditable` is set, pressing `g` resolves with `'__gas__'` so the caller can
 * prompt for a new mocked GAS status.
 * @param {MenuItem[]} items
 * @param {string} title
 * @param {{ hint?: string, statusLine?: string, gasEditable?: boolean, outputAvailable?: boolean, initialKey?: string, arrowThemeKey?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function radioMenu(
  items,
  title,
  {
    hint = '',
    statusLine = commandStatusLine,
    gasEditable = false,
    outputAvailable = false,
    initialKey,
    arrowThemeKey
  } = {}
) {
  return new Promise((resolve) => {
    let cursor = items.findIndex((i) => i.key === initialKey && !i.disabled)
    if (cursor === -1) cursor = items.findIndex((i) => !i.disabled)
    if (cursor === -1) cursor = 0

    const hintText = hint || '↑ ↓  navigate    enter → select    esc → quit'

    function draw() {
      const maxItems = menuCapacity()
      const start = Math.max(0, Math.min(cursor - Math.floor(maxItems / 2), items.length - maxItems))
      const visibleItems = items.slice(start, start + maxItems)
      const body = radioMenuBody(visibleItems, title, hintText, cursor - start, arrowThemeKey)
      if (items.length > maxItems) {
        body.push(`  ${DIM}${start + 1}–${start + visibleItems.length} of ${items.length}${RESET_COLOR}`)
      }
      renderScreen(body, statusLine)
    }

    draw()
    process.stdout.on('resize', draw)
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    /**
     * @param {string} _  the raw character (unused)
     * @param {import('node:readline').Key} key
     */
    function onKey(_, key) {
      if (!key) return
      const seq = key.sequence ?? ''
      if (seq === KEYS.CTRL_C || (seq === KEYS.ESC && key.name === 'escape')) {
        cleanup()
        resolve('__quit__')
      } else if (seq === KEYS.UP) {
        let next = (cursor - 1 + items.length) % items.length
        while (items[next].disabled && next !== cursor) next = (next - 1 + items.length) % items.length
        cursor = next
        draw()
      } else if (seq === KEYS.DOWN) {
        let next = (cursor + 1) % items.length
        while (items[next].disabled && next !== cursor) next = (next + 1) % items.length
        cursor = next
        draw()
      } else if (outputAvailable && key.name === 'l') {
        cleanup()
        resolve('__output__')
      } else if (gasEditable && seq === KEYS.G) {
        cleanup()
        resolve('__gas__')
      } else if (seq === KEYS.ENTER || seq === KEYS.ENTER2) {
        if (items[cursor].disabled) return
        cleanup()
        resolve(items[cursor].key)
      }
    }

    const cleanup = () => {
      process.stdout.removeListener('resize', draw)
      makeCleanup(onKey)()
    }

    process.stdin.on('keypress', onKey)
  })
}

// ---------------------------------------------------------------------------
// Text prompt (free-form input)
// ---------------------------------------------------------------------------

/**
 * Single-line text prompt. Draws `title` plus an editable buffer, handles
 * printable keys / backspace, and resolves with the entered string on enter — or
 * `null` on esc / ctrl-c.
 * @param {string} title
 * @param {{ initial?: string, hint?: string, mask?: boolean }} [opts]
 * @returns {Promise<string | null>}
 */
export async function promptText(
  title,
  { initial = '', hint = 'type a value    enter → save    esc → cancel', mask = false } = {}
) {
  return new Promise((resolve) => {
    let buffer = initial
    // Pre-filled text opens "selected" (reverse video) so it's obvious the whole
    // value will be replaced the moment you type — or wiped with a single
    // backspace. Cleared as soon as the user starts editing.
    let selected = initial.length > 0

    function draw() {
      const value = mask ? symbols.mask.repeat(buffer.length) : buffer
      const shown = selected ? `${INVERSE}${value}${RESET_COLOR}` : value
      const body = [
        `  ${colours.heading}${BOLD}${title}${RESET_COLOR}`,
        `  ${DIM}${hint}${RESET_COLOR}`,
        '',
        `  ${selectionArrow(true)}  ${colours.text}${shown}${DIM}${symbols.caret}${RESET_COLOR}`
      ]
      renderScreen(body)
    }

    draw()
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    /**
     * @param {string} str  the raw character
     * @param {import('node:readline').Key} key
     */
    function onKey(str, key) {
      if (!key) return
      const seq = key.sequence ?? ''
      if (seq === KEYS.CTRL_C || (seq === KEYS.ESC && key.name === 'escape')) {
        cleanup()
        resolve(null)
      } else if (seq === KEYS.ENTER || seq === KEYS.ENTER2) {
        cleanup()
        resolve(buffer)
      } else if (key.name === 'backspace') {
        // A single backspace clears the whole pre-selected value; afterwards it
        // deletes one character at a time.
        buffer = selected ? '' : buffer.slice(0, -1)
        selected = false
        draw()
      } else if (str && /^[^\x00-\x1f\x7f]+$/u.test(str) && !key.ctrl && !key.meta) {
        // Typing over the pre-selected value replaces it entirely.
        if (selected) buffer = ''
        selected = false
        buffer += str
        draw()
      }
    }

    const cleanup = makeCleanup(onKey)

    process.stdin.on('keypress', onKey)
  })
}

/**
 * A list of selectable presets with a free-form text field as the *last* option.
 * The cursor moves between the presets (0..N-1) and the field (index N) with the
 * arrow keys: typing edits the field, enter resolves either the highlighted
 * preset or the typed buffer. The field has a fixed-width "bottom border" so it
 * reads as an input box. Resolves with the chosen string on enter — or `null` on
 * esc / ctrl-c.
 * @param {string} title
 * @param {{ initial?: string, hint?: string, options?: string[], selectedOption?: string | null, fieldWidth?: number }} [opts]
 * @returns {Promise<string | null>}
 */
export async function promptTextWithOptions(
  title,
  {
    initial = '',
    hint = '↑ ↓  move    type to edit    enter → save    esc → cancel',
    options = [],
    selectedOption = null,
    fieldWidth = 30
  } = {}
) {
  return new Promise((resolve) => {
    let buffer = initial
    // cursor 0..N-1 = options[cursor], cursor === N = the text field (last item).
    // Start on the matching preset when one was supplied, otherwise on the field.
    const fieldIndex = options.length
    const matchIndex = selectedOption != null ? options.indexOf(selectedOption) : -1
    let cursor = matchIndex >= 0 ? matchIndex : fieldIndex
    // Pre-filled field text opens "selected" (reverse video) so it's obvious the
    // whole value will be replaced the moment you type — or wiped with a single
    // backspace. Only relevant when we start on the field with a pre-filled value.
    let selected = cursor === fieldIndex && buffer.length > 0

    function draw() {
      const fieldActive = cursor === fieldIndex
      const shown = selected ? `${INVERSE}${buffer}${RESET_COLOR}` : buffer
      const caret = fieldActive ? `${DIM}${symbols.caret}${RESET_COLOR}` : ''
      const fieldArrow = selectionArrow(fieldActive)
      const body = [`  ${colours.heading}${BOLD}${title}${RESET_COLOR}`, `  ${DIM}${hint}${RESET_COLOR}`, '']
      options.forEach((opt, i) => {
        const active = cursor === i
        const arrow = selectionArrow(active, '', colours.menuSelected)
        const label = `${active ? colours.menuSelected + BOLD : colours.menuItem}${opt}${RESET_COLOR}`
        body.push(`  ${arrow}  ${label}`)
      })
      // The text field renders last, with a fixed-width bottom border beneath it.
      body.push(
        '',
        `  ${fieldArrow}  ${colours.text}${shown}${caret}${RESET_COLOR}`,
        `  ${' '.repeat(ARROW_WIDTH + 2)}${colours.border}${symbols.border.repeat(fieldWidth)}${RESET_COLOR}`
      )
      renderScreen(body)
    }

    draw()
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    /**
     * @param {string} str  the raw character
     * @param {import('node:readline').Key} key
     */
    function onKey(str, key) {
      if (!key) return
      const seq = key.sequence ?? ''
      const total = fieldIndex + 1
      if (seq === KEYS.CTRL_C || (seq === KEYS.ESC && key.name === 'escape')) {
        cleanup()
        resolve(null)
      } else if (seq === KEYS.UP) {
        cursor = (cursor - 1 + total) % total
        draw()
      } else if (seq === KEYS.DOWN) {
        cursor = (cursor + 1) % total
        draw()
      } else if (seq === KEYS.ENTER || seq === KEYS.ENTER2) {
        cleanup()
        resolve(cursor === fieldIndex ? buffer : options[cursor])
      } else if (cursor === fieldIndex && key.name === 'backspace') {
        // A single backspace clears the whole pre-selected value; afterwards it
        // deletes one character at a time.
        buffer = selected ? '' : buffer.slice(0, -1)
        selected = false
        draw()
      } else if (cursor === fieldIndex && str && str.length === 1 && str >= ' ' && !key.ctrl && !key.meta) {
        // Typing over the pre-selected value replaces it entirely.
        if (selected) buffer = ''
        selected = false
        buffer += str
        draw()
      }
    }

    const cleanup = makeCleanup(onKey)

    process.stdin.on('keypress', onKey)
  })
}

// ---------------------------------------------------------------------------
// Toggle menu (addon selection)
// ---------------------------------------------------------------------------

/**
 * Multi-select menu. Toggles `selected` on items via space/`a`, and resolves with
 * the mutated `items` array on enter — or `null` on esc / ctrl-c.
 * @param {ToggleItem[]} items
 * @param {string} title
 * @returns {Promise<ToggleItem[] | null>}
 */
export async function toggleMenu(items, title) {
  return new Promise((resolve) => {
    // Start cursor on first non-disabled item
    let cursor = items.findIndex((i) => !i.disabled)
    if (cursor === -1) cursor = 0

    const LABEL_WIDTH = Math.max(...items.map((i) => visibleLen(i.label))) + 2

    function draw() {
      const body = [
        `  ${colours.heading}${BOLD}${title}${RESET_COLOR}`,
        `  ${DIM}↑ ↓  navigate    space → toggle    a → select all    enter → confirm    esc → back${RESET_COLOR}`,
        ''
      ]
      const maxItems = menuCapacity()
      const start = Math.max(0, Math.min(cursor - Math.floor(maxItems / 2), items.length - maxItems))
      items.slice(start, start + maxItems).forEach((item, i) => {
        const active = i + start === cursor
        const disabled = !!item.disabled
        const selected = item.selected
        const style = menuColours(item)
        const arrow = selectionArrow(active && !disabled, item.key, style.active)
        let marker, rawLabel, desc
        if (disabled) {
          marker = `${DIM}${padVisible(CIRCLE, TOGGLE_WIDTH)}${RESET_COLOR}`
          rawLabel = `${DIM}${item.label}${RESET_COLOR}`
          desc = `${DIM}${item.description}${RESET_COLOR}`
        } else {
          marker = selected
            ? `${colours.selected}${padVisible(TICK, TOGGLE_WIDTH)}${RESET_COLOR}`
            : `${DIM}${padVisible(CIRCLE, TOGGLE_WIDTH)}${RESET_COLOR}`
          const labelColour = active ? style.active + BOLD : selected ? colours.selected : style.resting
          rawLabel = `${labelColour}${item.label}${RESET_COLOR}`
          desc = `${DIM}${item.description}${RESET_COLOR}`
        }
        const label = padVisible(rawLabel, LABEL_WIDTH)
        body.push(`  ${arrow}  ${marker}  ${label}  ${desc}`)
      })
      if (items.length > maxItems) {
        body.push(`  ${DIM}${start + 1}–${Math.min(items.length, start + maxItems)} of ${items.length}${RESET_COLOR}`)
      }
      renderScreen(body)
    }

    draw()
    process.stdout.on('resize', draw)
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    /**
     * @param {string} _  the raw character (unused)
     * @param {import('node:readline').Key} key
     */
    function onKey(_, key) {
      if (!key) return
      const seq = key.sequence ?? ''
      if (seq === KEYS.CTRL_C || (seq === KEYS.ESC && key.name === 'escape')) {
        cleanup()
        resolve(null)
      } else if (seq === KEYS.UP) {
        let next = (cursor - 1 + items.length) % items.length
        while (items[next].disabled && next !== cursor) next = (next - 1 + items.length) % items.length
        cursor = next
        draw()
      } else if (seq === KEYS.DOWN) {
        let next = (cursor + 1) % items.length
        while (items[next].disabled && next !== cursor) next = (next + 1) % items.length
        cursor = next
        draw()
      } else if (seq === KEYS.SPACE) {
        if (!items[cursor].disabled) items[cursor].selected = !items[cursor].selected
        draw()
      } else if (seq === KEYS.A) {
        const allSelected = items.filter((i) => !i.disabled).every((i) => i.selected)
        items.forEach((i) => {
          if (!i.disabled) i.selected = !allSelected
        })
        draw()
      } else if (seq === KEYS.ENTER || seq === KEYS.ENTER2) {
        cleanup()
        resolve(items)
      }
    }

    const cleanup = () => {
      process.stdout.removeListener('resize', draw)
      makeCleanup(onKey)()
    }

    process.stdin.on('keypress', onKey)
  })
}

// ---------------------------------------------------------------------------
// Scale prompt
// ---------------------------------------------------------------------------

/**
 * Prompt for a replica count via a radio menu.
 * @returns {Promise<number | null>}  chosen replica count, or null if cancelled
 */
export async function promptScale() {
  const scaleItems = [
    { key: '2', label: '2 replicas', description: 'default' },
    { key: '3', label: '3 replicas', description: '' },
    { key: '4', label: '4 replicas', description: '' },
    { key: '6', label: '6 replicas', description: '' }
  ]
  const chosen = await radioMenu(scaleItems, 'Scale factor for grants-ui / grants-ui-backend', {
    hint: '↑ ↓  navigate    enter → select    esc → back'
  })
  if (!chosen || chosen === '__quit__') return null
  return Number.parseInt(chosen, 10)
}

// ---------------------------------------------------------------------------
// Stdin teardown helper — must be called before any blocking command
// ---------------------------------------------------------------------------

// Full teardown — used when handing off to a non-returning command (non-interactive paths)
/** @returns {void} */
export function releaseStdin() {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
  } catch {
    // ignore
  }
  process.stdout.write(SHOW_CURSOR)
  process.stdin.destroy()
}

// Soft pause — disables raw mode and shows cursor while docker runs.
// Stays in the alternate screen buffer so docker output is discarded on exit.
/** @returns {void} */
export function pauseStdin() {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
  } catch {
    // ignore
  }
  process.stdout.write(CLEAR_SCREEN + SHOW_CURSOR)
}

// Re-enable raw mode and hide cursor after a blocking docker command returns
/** @returns {void} */
export function resumeStdin() {
  process.stdout.write(HIDE_CURSOR)
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) process.stdin.setRawMode(true)
}

/**
 * @typedef {object} MenuItem
 * @property {string} key  identifier resolved when the item is chosen
 * @property {string} label  text shown in the menu
 * @property {string} description  dim helper text shown after the label
 * @property {boolean} [disabled]  non-selectable when true
 * @property {string} [colour]  label colour for both focused and resting states
 */

/**
 * @typedef {MenuItem & { selected?: boolean }} ToggleItem  a MenuItem with a toggle state
 */
