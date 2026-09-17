// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { stripVTControlCharacters } from 'node:util'
import { radioMenu, renderScreen, setRuntimeStatusLine, shimmerText, showBusyMenu, toggleMenu } from './tui.js'

const originalRows = process.stdout.rows
const originalColumns = process.stdout.columns

test.each([
  ['older', 'older'],
  ['missing', 'latest'],
  ['disabled', 'latest'],
  [undefined, 'latest']
])(
  'radio menu starts at remembered choice %s or falls back to the first enabled item',
  async (initialKey, expected) => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const picked = radioMenu(
      [
        { key: 'latest', label: 'Latest', description: '' },
        { key: 'older', label: 'Older', description: '' },
        { key: 'disabled', label: 'Disabled', description: '', disabled: true }
      ],
      'Versions',
      { initialKey }
    )
    process.stdin.emit('keypress', '', { sequence: '\r', name: 'return' })
    await expect(picked).resolves.toBe(expected)
  }
)

afterEach(() => {
  process.stdout.rows = originalRows
  process.stdout.columns = originalColumns
  setRuntimeStatusLine('')
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  renderScreen([], '')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test.each(['', '✔ Unit tests completed  l → output', '✘ Unit tests failed (exit 1)  l → output'])(
  'command status "%s" sits above a divider and the persistent runtime line',
  (status) => {
    process.stdout.rows = 24
    process.stdout.columns = 80
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    setRuntimeStatusLine('Running: Core, Land Grants  │  GAS: RECEIVED')
    renderScreen(['  Checks'], status)
    const lines = stripVTControlCharacters(String(write.mock.lastCall?.[0])).split('\n')
    expect(lines).toHaveLength(24)
    expect(lines.at(-4)).toBe(`  ${status || 'Ready'}`)
    expect(lines.at(-3)).toMatch(/^ {2}[─-]+$/)
    expect(lines.at(-2)).toBe('  Running: Core, Land Grants  │  GAS: RECEIVED')
  }
)

test('busy animation updates only the command row above the runtime footer', () => {
  vi.useFakeTimers()
  process.stdout.rows = 24
  process.stdout.columns = 80
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  setRuntimeStatusLine('Running: Core  │  GAS: RECEIVED')
  const items = Array.from({ length: 20 }, (_, i) => ({ key: String(i), label: `action ${i}`, description: '' }))
  const stop = showBusyMenu(items, 'Starting…', vi.fn())
  try {
    const lines = stripVTControlCharacters(String(write.mock.lastCall?.[0])).split('\n')
    expect(lines).toHaveLength(23)
    expect(lines.at(-3)).toBe('  Starting…')
    expect(lines.at(-1)).toBe('  Running: Core  │  GAS: RECEIVED')
    write.mockClear()
    stop.update('Waiting for healthy containers…')
    vi.advanceTimersByTime(45)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.lastCall?.[0]).toContain('\x1b[21;1H')
    expect(stripVTControlCharacters(String(write.mock.lastCall?.[0]))).toBe('  Waiting for healthy containers…')
  } finally {
    stop()
  }
})

test.each(['radio', 'toggle'])('%s menus scroll without pushing either footer line off screen', async (kind) => {
  process.stdout.rows = 24
  process.stdout.columns = 80
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  setRuntimeStatusLine('Running: Core')
  renderScreen([], '✔ Completed  l → output')
  const items = Array.from({ length: 20 }, (_, i) => ({ key: String(i), label: `action ${i}`, description: '' }))
  const picked = kind === 'radio' ? radioMenu(items, 'Menu') : toggleMenu(items, 'Menu')
  try {
    for (let i = 0; i < 19; i++) {
      process.stdin.emit('keypress', '', { sequence: '\x1b[B', name: 'down' })
    }
    const lines = stripVTControlCharacters(String(write.mock.lastCall?.[0])).split('\n')
    expect(lines).toHaveLength(24)
    expect(lines.join('\n')).toContain('action 19')
    expect(lines.at(-4)).toBe('  ✔ Completed  l → output')
    expect(lines.at(-2)).toBe('  Running: Core')
  } finally {
    process.stdin.emit('keypress', '', { sequence: '\x1b', name: 'escape' })
    await picked
  }
})

test('GAS and Tailscale share one runtime row below the busy animation', () => {
  vi.useFakeTimers()
  process.stdout.rows = 24
  process.stdout.columns = 80
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  setRuntimeStatusLine('Running: Core  │  GAS: RECEIVED  │  \x1b[34mTailscale: https://test.example.ts.net\x1b[0m')
  const items = Array.from({ length: 20 }, (_, i) => ({ key: String(i), label: `action ${i}`, description: '' }))
  const stop = showBusyMenu(items, 'Switching mode…', vi.fn())
  try {
    const lines = stripVTControlCharacters(String(write.mock.lastCall?.[0])).split('\n')
    expect(lines).toHaveLength(23)
    expect(lines.at(-1)).toBe('  Running: Core  │  GAS: RECEIVED  │  Tailscale: https://test.example.ts.net')
    expect(lines.at(-3)).toBe('  Switching mode…')
    write.mockClear()
    vi.advanceTimersByTime(45)
    expect(write.mock.lastCall?.[0]).toContain('\x1b[21;1H')
  } finally {
    stop()
  }
})

test.each(['radio', 'toggle'])('%s reflows the complete coloured runtime status on resize', async (kind) => {
  process.stdout.rows = 24
  process.stdout.columns = 100
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const status = 'Running: Core  │  GAS: RECEIVED  │  \x1b[34mTailscale: https://test.example.ts.net\x1b[0m'
  const plain = stripVTControlCharacters(status)
  setRuntimeStatusLine(status)
  const items = Array.from({ length: 20 }, (_, i) => ({ key: String(i), label: `action ${i}`, description: '' }))
  const originalListeners = process.stdout.listenerCount('resize')
  const picked = kind === 'radio' ? radioMenu(items, 'Menu') : toggleMenu(items, 'Menu')
  try {
    process.stdout.columns = 50
    process.stdout.emit('resize')
    const raw = String(write.mock.lastCall?.[0])
    const lines = stripVTControlCharacters(raw).split('\n')
    expect(lines).toHaveLength(24)
    expect(
      lines
        .slice(-3, -1)
        .map((line) => line.slice(2))
        .join('')
    ).toBe(plain)
    expect(lines.every((line) => line.length <= 49)).toBe(true)
    expect(raw).toContain('\x1b[34m')

    process.stdout.columns = 100
    process.stdout.emit('resize')
    const wider = stripVTControlCharacters(String(write.mock.lastCall?.[0])).split('\n')
    expect(wider.at(-2)).toBe(`  ${plain}`)
    expect(wider).toHaveLength(24)
  } finally {
    process.stdin.emit('keypress', '', { sequence: '\x1b', name: 'escape' })
    await picked
  }
  expect(process.stdout.listenerCount('resize')).toBe(originalListeners)
})

test('busy animation moves above the wrapped footer when the terminal narrows', () => {
  vi.useFakeTimers()
  process.stdout.rows = 24
  process.stdout.columns = 100
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const status = 'Running: Core  │  GAS: RECEIVED  │  Tailscale: https://test.example.ts.net'
  setRuntimeStatusLine(status)
  const stop = showBusyMenu([], 'Switching mode…', vi.fn())
  try {
    process.stdout.columns = 50
    process.stdout.emit('resize')
    const lines = stripVTControlCharacters(String(write.mock.lastCall?.[0])).split('\n')
    expect(lines).toHaveLength(23)
    expect(
      lines
        .slice(-2)
        .map((line) => line.slice(2))
        .join('')
    ).toBe(status)
    write.mockClear()
    vi.advanceTimersByTime(45)
    expect(write.mock.lastCall?.[0]).toContain('\x1b[20;1H')
  } finally {
    stop()
  }
})

test('the shimmer moves a white highlight from left to right without changing the text', () => {
  const first = shimmerText('Working', 8)
  const later = shimmerText('Working', 10)
  expect(stripVTControlCharacters(first)).toBe('Working')
  expect(first).toContain('\x1b[38;2;255;255;255mW')
  expect(later).toContain('\x1b[38;2;255;255;255mr')
  expect(shimmerText('Working', 10, false)).toBe('Working')
})

test('busy menus ignore navigation, animate only the status row, and remove listeners/timers on completion', () => {
  vi.useFakeTimers()
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const cancel = vi.fn()
  const originalListeners = process.stdin.listenerCount('keypress')
  const stop = showBusyMenu(
    [{ key: 'up', label: 'up', description: 'Start containers' }],
    'Starting containers…',
    cancel
  )
  try {
    expect(write.mock.calls[0][0]).toContain('menu disabled')
    write.mockClear()
    process.stdin.emit('keypress', '', { sequence: '\x1b[B', name: 'down' })
    process.stdin.emit('keypress', '', { sequence: '\r', name: 'return' })
    expect(write).not.toHaveBeenCalled()
    vi.advanceTimersByTime(90)
    expect(write).toHaveBeenCalledTimes(2)
    expect(write.mock.calls[0][0]).not.toContain('Start containers')
    process.stdin.emit('keypress', '', { sequence: '\x03', name: 'c', ctrl: true })
    expect(cancel).toHaveBeenCalledTimes(1)
  } finally {
    stop()
  }
  expect(process.stdin.listenerCount('keypress')).toBe(originalListeners)
  write.mockClear()
  vi.advanceTimersByTime(100)
  expect(write).not.toHaveBeenCalled()
})

test('l opens the latest output from the main menu', async () => {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const picked = radioMenu([{ key: 'test', label: 'test', description: 'Run tests' }], 'Menu', {
    outputAvailable: true
  })
  process.stdin.emit('keypress', 'l', { name: 'l', sequence: 'l' })
  await expect(picked).resolves.toBe('__output__')
})

test('busy status accepts progress updates without re-enabling the menu or replacing cancellation', () => {
  vi.useFakeTimers()
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const stop = showBusyMenu([], 'Starting…', vi.fn())
  try {
    stop.update('unit: 12 test files completed…')
    vi.advanceTimersByTime(45)
    expect(stripVTControlCharacters(String(write.mock.lastCall?.[0]))).toContain('12 test files completed')
    process.stdin.emit('keypress', '', { sequence: '\x03', name: 'c', ctrl: true })
    stop.update('unit: 13 test files completed…')
    vi.advanceTimersByTime(45)
    expect(stripVTControlCharacters(String(write.mock.lastCall?.[0]))).toContain('Cancelling…')
  } finally {
    stop()
  }
})

test('a small terminal keeps the running status on one visible row', () => {
  const previousColumns = process.stdout.columns
  const previousRows = process.stdout.rows
  process.stdout.columns = 40
  process.stdout.rows = 24
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const items = Array.from({ length: 20 }, (_, i) => ({
    key: String(i),
    label: `action ${i}`,
    description: 'Long description '.repeat(5)
  }))
  const stop = showBusyMenu(items, 'Running a very long action description that needs clipping…', vi.fn())
  try {
    const lines = stripVTControlCharacters(String(write.mock.calls[0][0])).split('\n')
    expect(lines.length).toBeLessThanOrEqual(24)
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThan(40)
    expect(lines.at(-1)).toContain('Running a very long action')
  } finally {
    stop()
    process.stdout.columns = previousColumns
    process.stdout.rows = previousRows
  }
})
