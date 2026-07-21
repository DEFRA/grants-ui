/* eslint-disable curly, no-control-regex */

import * as readline from 'node:readline'

import {
  ARROW,
  BOLD,
  CIRCLE,
  CLEAR_SCREEN,
  CYAN,
  DIM,
  FADED_PURPLE,
  GREEN,
  HIDE_CURSOR,
  IS_WINDOWS,
  KEYS,
  PURPLE,
  RESET_COLOR,
  SHOW_CURSOR,
  TICK,
  VERSION
} from './constants.js'

/**
 * Length of a string ignoring ANSI colour escapes, so padding maths line up.
 * @param {string} str
 * @returns {number}
 */
export function visibleLen(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length
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

// ---------------------------------------------------------------------------
// Shared screen renderer
// ---------------------------------------------------------------------------

// "Grants TUI" drawn with Unicode half-block glyphs so the name renders three
// terminal rows tall while staying legible, with cyan "go faster" stripes down
// the left gutter. Generated once and kept as literals (no runtime font engine).
const STRIPES = '╱╱╱'
const WORDMARK = [
  '▄▀▀▀  █▀▀▀▄ ▄▀▀▀▄ █▄  █ ▀▀█▀▀ ▄▀▀▀▀    ▀▀█▀▀ █   █ ▀█▀',
  '█  ▄▄ ██▀▀  █▄▄▄█ █ ▀▄█   █    ▀▀▀▄      █   █   █  █',
  '▀▄▄▄▀ █ ▀▀▄ █   █ █   █   █   ▄▄▄▄▀      █   ▀▄▄▄▀ ▄█▄'
]

// Half-block glyphs are unreliable on legacy Windows consoles, so fall back to a
// plain single-line title there.
export const HEADER = IS_WINDOWS
  ? [
      '',
      `  ${BOLD}${GREEN}Grants TUI${RESET_COLOR}  ${DIM}v${VERSION}${RESET_COLOR}`,
      `  ${DIM}${'─'.repeat(40)}${RESET_COLOR}`,
      ''
    ]
  : [
      '',
      ...WORDMARK.map((line) => `  ${PURPLE}${STRIPES}${RESET_COLOR}  ${BOLD}${GREEN}${line}${RESET_COLOR}`),
      `  ${DIM}docker compose launcher · v${VERSION}${RESET_COLOR}`,
      ''
    ]

/**
 * Clear the screen and draw the header followed by the given body lines.
 * @param {string[]} bodyLines
 * @returns {void}
 */
export function renderScreen(bodyLines) {
  const lines = [...HEADER, ...bodyLines, '']
  process.stdout.write(HIDE_CURSOR + CLEAR_SCREEN + lines.join('\n'))
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
 * with the chosen item's `key` — or `'__quit__'` on esc / ctrl-c.
 * @param {MenuItem[]} items
 * @param {string} title
 * @param {{ hint?: string, statusLine?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function radioMenu(items, title, { hint = '', statusLine = '' } = {}) {
  return new Promise((resolve) => {
    // Start cursor on first non-disabled item
    let cursor = items.findIndex((i) => !i.disabled)
    if (cursor === -1) cursor = 0

    const LABEL_WIDTH = Math.max(...items.map((i) => visibleLen(i.label))) + 2
    const hintText = hint || '↑ ↓  navigate    enter → select    esc → quit'

    function draw() {
      const body = [`  ${BOLD}${title}${RESET_COLOR}`, `  ${DIM}${hintText}${RESET_COLOR}`, '']
      items.forEach((item, i) => {
        const active = i === cursor
        const disabled = !!item.disabled
        const arrowColour = item.key === 'refresh-overrides' ? PURPLE : CYAN
        const arrow = active ? `${arrowColour}${ARROW}${RESET_COLOR}` : ' '
        let rawLabel, desc
        if (disabled) {
          rawLabel = `${DIM}${item.label}${RESET_COLOR}`
          desc = `${DIM}${item.description}${RESET_COLOR}`
        } else if (item.key === 'refresh-overrides') {
          // Faded purple at rest, full bold purple when highlighted, so it's
          // obvious when this sub-item is the current selection.
          rawLabel = active
            ? `${BOLD}${PURPLE}${item.label}${RESET_COLOR}`
            : `${FADED_PURPLE}${item.label}${RESET_COLOR}`
          desc = `${DIM}${item.description}${RESET_COLOR}`
        } else {
          rawLabel = active ? `${CYAN}${BOLD}${item.label}${RESET_COLOR}` : item.label
          desc = `${DIM}${item.description}${RESET_COLOR}`
        }
        const label = padVisible(rawLabel, LABEL_WIDTH)
        body.push(`  ${arrow}  ${label}  ${desc}`)
      })
      if (statusLine) {
        body.push('', `  ${statusLine}`)
      }
      renderScreen(body)
    }

    draw()
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
      } else if (seq === KEYS.ENTER || seq === KEYS.ENTER2) {
        if (items[cursor].disabled) return
        cleanup()
        resolve(items[cursor].key)
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
        `  ${BOLD}${title}${RESET_COLOR}`,
        `  ${DIM}↑ ↓  navigate    space → toggle    a → select all    enter → confirm    esc → back${RESET_COLOR}`,
        ''
      ]
      items.forEach((item, i) => {
        const active = i === cursor
        const disabled = !!item.disabled
        const selected = item.selected
        const arrow = active ? `${CYAN}${ARROW}${RESET_COLOR}` : ' '
        let marker, rawLabel, desc
        if (disabled) {
          marker = `${DIM}${CIRCLE}${RESET_COLOR}`
          rawLabel = `${DIM}${item.label}${RESET_COLOR}`
          desc = `${DIM}${item.description}${RESET_COLOR}`
        } else {
          marker = selected ? `${GREEN}${TICK}${RESET_COLOR}` : `${DIM}${CIRCLE}${RESET_COLOR}`
          rawLabel = selected ? `${GREEN}${item.label}${RESET_COLOR}` : item.label
          desc = `${DIM}${item.description}${RESET_COLOR}`
        }
        const label = padVisible(rawLabel, LABEL_WIDTH)
        body.push(`  ${arrow}  ${marker}  ${label}  ${desc}`)
      })
      renderScreen(body)
    }

    draw()
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

    const cleanup = makeCleanup(onKey)

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
 */

/**
 * @typedef {MenuItem & { selected?: boolean }} ToggleItem  a MenuItem with a toggle state
 */
