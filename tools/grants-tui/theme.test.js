// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_THEME, loadTheme, resolveTheme } from './theme.js'

let root
const originalIsTTY = process.stdout.isTTY

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'grants-tui-theme-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  process.stdout.isTTY = originalIsTTY
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function saveTheme(settings, name = '.grants-ui-cli-theme.json') {
  const filename = join(root, name)
  writeFileSync(filename, JSON.stringify(settings))
  return filename
}

test('the ignored local file is automatic and default explicitly bypasses it', () => {
  saveTheme({ title: 'LOCAL', colours: { accent: '#123456' } })
  const theme = loadTheme({ root, ansi: true })
  expect(theme.title).toBe('LOCAL')
  expect(theme.colours.accent).toBe('\x1b[38;2;18;52;86m')
  expect(theme.wordmark).toEqual(DEFAULT_THEME.wordmark)
  expect(theme.symbols.arrow).toBe(DEFAULT_THEME.symbols.arrow)
  expect(loadTheme({ root, selection: 'default' }).title).toBe('Grants TUI')
})

test('a relative or absolute path can select the same portable file', () => {
  mkdirSync(join(root, '.grants-ui-cli-themes'))
  const relative = '.grants-ui-cli-themes/personal.json'
  const absolute = saveTheme({ title: 'SHARED' }, relative)
  expect(loadTheme({ root, selection: relative }).title).toBe('SHARED')
  expect(loadTheme({ root: tmpdir(), selection: absolute }).title).toBe('SHARED')
})

test.each([
  ['missing', undefined],
  ['empty', ''],
  ['whitespace-only', ' \n\t '],
  ['invalid JSON', '{'],
  ['invalid settings', '{"symbols":{"border":"wide"}}'],
  ['null', 'null']
])('a %s theme silently uses the complete default theme', (_, content) => {
  if (content !== undefined) {
    writeFileSync(join(root, '.grants-ui-cli-theme.json'), content)
  }
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const defaults = resolveTheme({}, { ansi: true })
  expect(loadTheme({ root, ansi: true })).toEqual(defaults)
  expect(loadTheme({ root, selection: '.grants-ui-cli-theme.json', ansi: true })).toEqual(defaults)
  expect(stdout).not.toHaveBeenCalled()
  expect(stderr).not.toHaveBeenCalled()
})

test.each(
  [
    null,
    [],
    { version: 2 },
    { accent: 'red' },
    { colours: { typo: 'red' } },
    { colours: null },
    { colours: { accent: 256 } },
    { colours: { menuSelected: null } },
    { colours: { accent: '\x1b[31m' } },
    { title: 'two\nlines' },
    { logo: ['one'] },
    { wordmark: ['one', {}, 'three'] },
    { symbols: null },
    { symbols: { arrow: '' } },
    { symbols: { border: '界' } },
    { items: null },
    { items: [] },
    { items: { reset: { arrow: '\x1b[2J' } } },
    { items: { reset: { colour: 'constructor' } } }
  ].map((settings) => ({ settings }))
)('invalid theme data is rejected: $settings', ({ settings }) => {
  expect(() => resolveTheme(settings)).toThrow()
})

test('colours and symbols merge by role and retain console fallbacks', () => {
  const settings = {
    colours: { accent: 123, success: '#abcdef', error: 'magenta' },
    symbols: { arrow: '👩‍💻', selected: '✓' },
    items: { reset: { arrow: '>>', colour: 'red', restingColour: 'dim' } }
  }
  const theme = resolveTheme(settings, { ansi: true })
  expect(theme.colours).toMatchObject({
    accent: '\x1b[38;5;123m',
    success: '\x1b[38;2;171;205;239m',
    error: '\x1b[35m',
    warning: '\x1b[33m'
  })
  expect(theme.items.reset).toEqual({ arrow: '>>', colour: '\x1b[31m', restingColour: '\x1b[2m' })
  const plain = resolveTheme(settings)
  expect(Object.values(plain.colours).every((colour) => colour === '')).toBe(true)
  expect(plain.items.reset.colour).toBe('')
  const windows = resolveTheme(settings, { windows: true })
  expect(windows.symbols).toMatchObject({ arrow: '>', selected: '[x]', unselected: '[ ]', border: '-' })
  expect(windows.items.reset.arrow).toBe('>')
  expect(settings.items.reset.colour).toBe('red')
})

test.each([
  ['orange', '38;5;208'],
  ['Purple', '35'],
  [' gold ', '38;5;220'],
  ['grey', '90'],
  ['dim orange', '2;38;5;208'],
  ['dim-purple', '2;35'],
  ['dim #123456', '2;38;2;18;52;86']
])('readable colour %s compiles consistently across roles and item overrides', (colour, code) => {
  const settings = { colours: { menuItem: colour }, items: { reset: { colour } } }
  const theme = resolveTheme(settings, { ansi: true })
  expect(theme.colours.menuItem).toBe(`\x1b[${code}m`)
  expect(theme.items.reset.colour).toBe(theme.colours.menuItem)
  expect(resolveTheme(settings).colours.menuItem).toBe('')
})

test('every omitted colour uses its own default regardless of other overrides', () => {
  const defaults = resolveTheme({}, { ansi: true })
  for (const omitted of Object.keys(DEFAULT_THEME.colours)) {
    const colours = Object.fromEntries(
      Object.keys(DEFAULT_THEME.colours)
        .filter((key) => key !== omitted)
        .map((key) => [key, 'orange'])
    )
    const theme = resolveTheme({ colours }, { ansi: true })
    expect({ [omitted]: theme.colours[omitted] }).toEqual({ [omitted]: defaults.colours[omitted] })
  }
})

test('explicit menu and local colours override their defaults independently', () => {
  const explicit = resolveTheme(
    { colours: { menuItem: 'lime', menuSelected: 'pink', local: 'orange', localMuted: 'dim orange' } },
    { ansi: true }
  )
  expect(explicit.colours).toMatchObject({
    menuItem: '\x1b[38;5;118m',
    menuSelected: '\x1b[38;5;213m',
    local: '\x1b[38;5;208m',
    localMuted: '\x1b[2;38;5;208m'
  })
})

test.each([undefined, '>>'])('reset choices share the reset marker %s and retain their action keys', async (arrow) => {
  vi.stubEnv(
    'GT_THEME',
    saveTheme({
      symbols: { arrow: '>' },
      items: { reset: arrow === undefined ? {} : { arrow }, yes: { arrow: '!' }, no: { arrow: '?' } }
    })
  )
  vi.resetModules()
  const { radioMenu } = await import('./tui.js')
  const { IS_WINDOWS } = await import('./constants.js')
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const items = [
    { key: 'yes', label: 'Yes', description: 'Reset' },
    { key: 'no', label: 'No', description: 'Cancel' }
  ]
  const picked = radioMenu(items, 'Confirm reset?', { arrowThemeKey: 'reset' })
  const marker = IS_WINDOWS ? '>' : (arrow ?? '>')
  const rendered = () => stripVTControlCharacters(String(write.mock.lastCall?.[0])).split('\n')
  try {
    expect(rendered().find((line) => line.includes('Yes'))).toBe(`  ${marker}  Yes    Reset`)
    process.stdin.emit('keypress', '', { sequence: '\x1b[B', name: 'down' })
    expect(rendered().find((line) => line.includes('No'))).toBe(`  ${marker}  No     Cancel`)
    process.stdin.emit('keypress', '', { sequence: '\r', name: 'return' })
    await expect(picked).resolves.toBe('no')
    expect(items.map((item) => item.key)).toEqual(['yes', 'no'])
  } finally {
    process.stdin.emit('keypress', '', { sequence: '\x1b', name: 'escape' })
    await picked
  }
})

test.each(['radio', 'toggle', 'options'])(
  '%s uses theme colours for resting, focused, local and disabled menu items',
  async (kind) => {
    vi.stubEnv(
      'GT_THEME',
      saveTheme({
        title: 'CUSTOM TITLE',
        wordmark: ['COMPLETE', 'CUSTOM', 'WORDMARK'],
        colours: { menuItem: 'blue', menuSelected: 'gold', local: 'orange', localMuted: 'dim orange' }
      })
    )
    process.stdout.isTTY = true
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('NO_COLOR', '')
    vi.resetModules()
    const tui = await import('./tui.js')
    const { BOLD, DIM, LOCAL_COLOUR, THEME, IS_WINDOWS } = await import('./constants.js')
    expect(LOCAL_COLOUR).toBe('\x1b[38;5;208m')
    const header = stripVTControlCharacters(tui.HEADER.join('\n'))
    expect(header).toContain(IS_WINDOWS ? 'CUSTOM TITLE' : 'COMPLETE')
    expect(header).not.toContain('▄▀▀▀  █▀▀▀▄')
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const items = [
      { key: 'first', label: 'First', description: '' },
      { key: 'second', label: 'Second', description: '' },
      { key: 'local', label: 'Local', description: '' },
      { key: 'refresh-overrides', label: 'Refresh', description: '' },
      { key: 'disabled', label: 'Disabled', description: '', disabled: true }
    ]
    const picked =
      kind === 'radio'
        ? tui.radioMenu(items, 'Menu')
        : kind === 'toggle'
          ? tui.toggleMenu(items, 'Menu')
          : tui.promptTextWithOptions('Menu', { options: ['First', 'Second'], selectedOption: 'First' })
    try {
      const raw = String(write.mock.lastCall?.[0])
      expect(raw).toContain(`${THEME.colours.menuSelected}${BOLD}First`)
      expect(raw).toContain(`${THEME.colours.menuItem}Second`)
      if (kind !== 'options') {
        expect(raw).toContain(`${LOCAL_COLOUR}Local`)
        expect(raw).toContain(`${THEME.colours.localMuted}Refresh`)
        expect(raw).toContain(`${DIM}Disabled`)
        for (let i = 0; i < 3; i++) {
          process.stdin.emit('keypress', '', { sequence: '\x1b[B', name: 'down' })
        }
        expect(String(write.mock.lastCall?.[0])).toContain(`${LOCAL_COLOUR}${BOLD}Refresh`)
      }
    } finally {
      process.stdin.emit('keypress', '', { sequence: '\x1b', name: 'escape' })
      await picked
    }
  }
)

test.each(['radio', 'toggle', 'prompt', 'options'])(
  '%s renders a selected file, keeps mixed markers aligned and preserves input',
  async (kind) => {
    vi.stubEnv(
      'GT_THEME',
      saveTheme({
        title: 'LOCAL',
        wordmark: ['LOCAL', 'THEME', 'TEST'],
        colours: { heading: '#123456', border: 'blue', selected: 'yellow' },
        symbols: { arrow: '>', selected: '✅', unselected: '○', caret: '|', border: '=' },
        items: { first: { arrow: '👩‍💻', colour: 'magenta', restingColour: 'blue' } }
      })
    )
    process.stdout.isTTY = true
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('NO_COLOR', '')
    vi.resetModules()
    const tui = await import('./tui.js')
    const { GREEN, THEME, IS_WINDOWS } = await import('./constants.js')
    expect(GREEN).toBe(THEME.colours.success)
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const items = [
      { key: 'first', label: 'First', description: 'one', selected: true },
      { key: 'second', label: 'Second', description: 'two' }
    ]
    const picked =
      kind === 'radio'
        ? tui.radioMenu(items, 'Menu')
        : kind === 'toggle'
          ? tui.toggleMenu(items, 'Menu')
          : kind === 'prompt'
            ? tui.promptText('Menu', { initial: 'custom' })
            : tui.promptTextWithOptions('Menu', { initial: 'custom', options: ['First', 'Second'] })
    try {
      const raw = String(write.mock.lastCall?.[0])
      const lines = stripVTControlCharacters(raw).split('\n')
      expect(raw).toContain('LOCAL')
      expect(raw).toContain('\x1b[38;2;18;52;86m')
      if (kind === 'prompt' || kind === 'options') {
        expect(lines.join('\n')).toContain('custom|')
        process.stdin.emit('keypress', '', { sequence: '\r', name: 'return' })
        await expect(picked).resolves.toBe('custom')
      } else {
        const first = lines.find((line) => line.includes('First')) ?? ''
        const second = lines.find((line) => line.includes('Second')) ?? ''
        expect(first).toContain('First')
        expect(second).toContain('Second')
        expect(tui.visibleLen(first.slice(0, first.indexOf('First')))).toBe(
          tui.visibleLen(second.slice(0, second.indexOf('Second')))
        )
        expect(raw).toContain(IS_WINDOWS ? '>' : '👩‍💻')
        if (kind === 'toggle') {
          expect(raw).toContain('\x1b[33m')
          expect(raw).toContain('\x1b[35m\x1b[1mFirst')
          process.stdin.emit('keypress', ' ', { sequence: ' ', name: 'space' })
        }
        process.stdin.emit('keypress', '', { sequence: '\x1b[B', name: 'down' })
        const moved = String(write.mock.lastCall?.[0])
        expect(moved).toContain('\x1b[34mFirst')
        process.stdin.emit('keypress', '', { sequence: '\r', name: 'return' })
        await expect(picked).resolves.toEqual(kind === 'radio' ? 'second' : items)
      }
    } finally {
      process.stdin.emit('keypress', '', { sequence: '\x1b', name: 'escape' })
      await picked
    }
  }
)
