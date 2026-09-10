// @vitest-environment node
import { expect, test, vi } from 'vitest'
import { outputLines, viewOutput } from './output.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('renders output as text, stripping colours, cursor commands, links and control characters', () => {
  expect(outputLines('\x1b[31merror\x1b[0m\r\n\x1b[2J\x1b]8;;https://example.com\x07link\x1b]8;;\x07\x00')).toEqual([
    'error',
    'link'
  ])
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
