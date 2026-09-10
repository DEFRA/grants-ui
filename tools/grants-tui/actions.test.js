// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureAction, actionStatus } from './actions.js'

let directory
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gt-action-test-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('background action capture', () => {
  test('reports new log lines while the worker is still blocked and drains the last partial line', async () => {
    const logPath = join(directory, 'progress.log')
    const lines = []
    const running = captureAction(
      process.execPath,
      [
        '-e',
        `
      const fs = require('node:fs')
      fs.writeSync(1, 'first phase\\n')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400)
      fs.writeSync(2, 'final phase')
      process.exitCode = 7
    `
      ],
      logPath,
      {
        onOutputLine: (line) => {
          lines.push(line)
        }
      }
    )
    let result
    try {
      await vi.waitFor(() => expect(lines).toEqual(['first phase']))
      expect(await readFile(logPath, 'utf8')).toBe('first phase\n')
    } finally {
      result = await running
    }
    expect(lines).toEqual(['first phase', 'final phase'])
    expect(result.code).toBe(7)
    expect(await readFile(logPath, 'utf8')).toBe('first phase\nfinal phase')
  })

  test('keeps the event loop responsive and captures large stdout and stderr with the actual exit code', async () => {
    const logPath = join(directory, 'output.log')
    const tick = vi.fn()
    const timer = setInterval(tick, 10)
    let result
    try {
      result = await captureAction(
        process.execPath,
        [
          '-e',
          `
        const fs = require('node:fs')
        fs.writeSync(1, 'x'.repeat(2 * 1024 * 1024))
        fs.writeSync(2, '\\nerror detail: café\\n')
        setTimeout(() => process.exit(7), 150)
      `
        ],
        logPath
      )
    } finally {
      clearInterval(timer)
    }
    expect(result).toEqual({ code: 7, signal: null, cancelled: false })
    expect(tick).toHaveBeenCalled()
    expect(await readFile(logPath, 'utf8')).toBe('x'.repeat(2 * 1024 * 1024) + '\nerror detail: café\n')
    if (process.platform !== 'win32') {
      expect((await stat(logPath)).mode & 0o777).toBe(0o600)
    }
  })

  test('records process startup errors and returns a failure', async () => {
    const logPath = join(directory, 'missing.log')
    const result = await captureAction(join(directory, 'does-not-exist'), [], logPath)
    expect(result.code).toBe(1)
    expect(await readFile(logPath, 'utf8')).toContain('ENOENT')
  })

  test('does not start a command when its log cannot be opened', async () => {
    await expect(
      captureAction(process.execPath, ['-e', 'process.exit(0)'], join(directory, 'missing', 'run.log'))
    ).rejects.toThrow('ENOENT')
  })

  test('cancels a running action and reports exit 130', async () => {
    const logPath = join(directory, 'cancel.log')
    const result = await captureAction(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], logPath, {
      onCancelReady: (cancel) => setTimeout(cancel, 100)
    })
    expect(result.cancelled).toBe(true)
    expect(result.code).toBe(130)
  })

  test.skipIf(process.platform === 'win32')('cancellation also stops a grandchild process', async () => {
    const logPath = join(directory, 'tree.log')
    let cancel = () => {}
    const childCode = "require('node:fs').writeSync(1, 'ready'); setInterval(() => {}, 1000)"
    const running = captureAction(
      process.execPath,
      [
        '-e',
        `
      const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'inherit' })
      require('node:fs').writeSync(1, String(child.pid) + '\\n')
      setInterval(() => {}, 1000)
    `
      ],
      logPath,
      {
        onCancelReady: (fn) => {
          cancel = fn
        }
      }
    )
    try {
      await vi.waitFor(async () => expect(await readFile(logPath, 'utf8')).toContain('ready'))
      const pid = Number((await readFile(logPath, 'utf8')).split('\n')[0])
      cancel()
      await running
      await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow())
    } finally {
      cancel()
      await running
    }
  })

  test.each([
    ['lint', 'npm run lint'],
    ['format', 'npm run format'],
    ['audit:logs', 'npm run audit:logs'],
    ['audit:queue', 'npm run audit:queue'],
    ['audit:clear', 'npm run audit:clear'],
    ['all-tests', 'All tests summary:']
  ])('runs %s through the real worker in dry-run mode', async (action, expectedOutput) => {
    const logPath = join(directory, 'worker.log')
    const result = await captureAction(
      process.execPath,
      [fileURLToPath(new URL('./action-worker.js', import.meta.url)), JSON.stringify([action, [true]])],
      logPath
    )
    expect(result.code).toBe(0)
    expect(await readFile(logPath, 'utf8')).toContain(expectedOutput)
  })
})

test('completion statuses include failures and the output shortcut', () => {
  expect(actionStatus({ label: 'Unit tests', code: 7 })).toContain('failed (exit 7)')
  expect(actionStatus({ label: 'Unit tests', code: 0 })).toContain('completed')
  expect(actionStatus({ label: 'Unit tests', code: 130, cancelled: true })).toContain('cancelled (exit 130)')
  expect(actionStatus({ label: 'Unit tests', code: 1 })).toContain('l → output')
})
