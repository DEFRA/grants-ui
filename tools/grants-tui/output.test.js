// @vitest-environment node
import { expect, test, vi } from 'vitest'
import { outputLines, viewOutput, viewText } from './output.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('renders output as text, stripping colours, cursor commands, links and control characters', () => {
  expect(outputLines('\x1b[31merror\x1b[0m\r\n\x1b[2J\x1b]8;;https://example.com\x07link\x1b]8;;\x07\x00')).toEqual([
    'error',
    'link'
  ])
})

test('state viewer starts at the top, searches, scrolls, refreshes and cleans up', async () => {
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const keyListeners = process.stdin.listenerCount('keypress')
  const resizeListeners = process.stdout.listenerCount('resize')
  const refresh = vi
    .fn()
    .mockResolvedValue({ text: Array.from({ length: 80 }, (_, i) => `field ${i}`).join('\n'), highlightLines: [20] })
  const viewing = viewText({ title: 'Application state', subtitle: 'read-only', text: 'Loading', refresh })
  try {
    await vi.waitFor(() => expect(write.mock.lastCall?.[0]).toContain('field 0'))
    process.stdin.emit('keypress', '', { name: 'end' })
    expect(write.mock.lastCall?.[0]).toContain('field 79')
    process.stdin.emit('keypress', '/', {})
    process.stdin.emit('keypress', 'field 20', {})
    process.stdin.emit('keypress', '\r', { name: 'return' })
    expect(write.mock.lastCall?.[0]).toContain('field 20')
    refresh.mockResolvedValueOnce({ text: 'Updated state', highlightLines: [0] })
    process.stdin.emit('keypress', 'r', { name: 'r' })
    await vi.waitFor(() => expect(write.mock.lastCall?.[0]).toContain('Updated state'))
    expect(refresh).toHaveBeenCalledTimes(2)
    process.stdout.emit('resize')
    expect(write.mock.lastCall?.[0]).toContain('Updated state')
  } finally {
    process.stdin.emit('keypress', '', { name: 'escape' })
    await viewing
    write.mockRestore()
  }
  expect(process.stdin.listenerCount('keypress')).toBe(keyListeners)
  expect(process.stdout.listenerCount('resize')).toBe(resizeListeners)
  expect(refresh.mock.calls[0][0].aborted).toBe(true)
})

test('leaving during refresh aborts the read and prevents late terminal output', async () => {
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  /** @type {((value: { text: string }) => void) | undefined} */
  let finish
  const refresh = vi.fn(
    (_signal) =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const viewing = viewText({ title: 'State', subtitle: '', text: 'Loading', refresh })
  process.stdin.emit('keypress', 'r', { name: 'r' })
  expect(refresh).toHaveBeenCalledTimes(1)
  process.stdin.emit('keypress', '/', {})
  process.stdin.emit('keypress', '', { name: 'c', ctrl: true })
  await viewing
  const writes = write.mock.calls.length
  expect(finish).toBeTypeOf('function')
  finish?.({ text: 'Must not render' })
  await Promise.resolve()
  expect(write).toHaveBeenCalledTimes(writes)
  expect(refresh.mock.calls[0][0].aborted).toBe(true)
  write.mockRestore()
})

test('opens at the end, supports search and returns to the menu without leaking listeners', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gt-output-test-'))
  const logPath = join(directory, 'run.log')
  await writeFile(logPath, Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n'))
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const listenerCount = process.stdin.listenerCount('keypress')
  try {
    const viewing = viewOutput({ label: 'Test action', code: 7, logPath })
    await vi.waitFor(() => expect(write).toHaveBeenCalled())
    expect(write.mock.lastCall?.[0]).toContain('line 79')
    process.stdin.emit('keypress', '/', { sequence: '/' })
    process.stdin.emit('keypress', 'line 20', { sequence: 'line 20' })
    process.stdin.emit('keypress', '\r', { name: 'return' })
    expect(write.mock.lastCall?.[0]).toContain('line 20')
    process.stdin.emit('keypress', 'q', { name: 'q' })
    await viewing
    expect(process.stdin.listenerCount('keypress')).toBe(listenerCount)
  } finally {
    write.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
})
