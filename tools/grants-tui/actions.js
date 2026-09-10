/* eslint-disable curly */

import { spawn } from 'node:child_process'
import { closeSync, openSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { ANSI, DIM, GREEN, RED, RESET_COLOR, ROOT } from './constants.js'
import { showBusyMenu } from './tui.js'
import { createProgressTracker, followProgress } from './progress.js'

let menuItems = []
let menuTitle = 'What do you want to do?'
let lastRun = null
const runs = []
let cancelActive = null

export function setActionMenu(items, title = 'What do you want to do?') {
  menuItems = items
  menuTitle = title
}

export function getLastRun() {
  return lastRun
}

export function getActionRuns() {
  return [...runs].reverse()
}

export function cancelActiveAction() {
  if (!cancelActive) return false
  cancelActive()
  return true
}

export function actionStatus(run) {
  const outcome = run.cancelled ? 'cancelled' : run.code === 0 ? 'completed' : 'failed'
  const detail = run.signal ? run.signal : `exit ${run.code}`
  const suffix = run.code === 0 ? '' : ` (${detail})`
  const colour = run.code === 0 ? GREEN : RED
  const available = Math.max(4, (process.stdout.columns || 100) - outcome.length - suffix.length - 23)
  const label = run.label.length > available ? run.label.slice(0, available - 1) + '…' : run.label
  return `${colour}${run.code === 0 ? '✔' : '✖'}${RESET_COLOR}  ${label} — ${outcome}${suffix}  ${DIM}l → output${RESET_COLOR}`
}

/**
 * Capture directly to disk: no pipe buffer limits and no output in the menu.
 * A separate process group lets cancellation reach npm/docker grandchildren.
 * @param {string} command
 * @param {string[]} args
 * @param {string} logPath
 * @param {{ onCancelReady?: (cancel: () => void) => void, onOutputLine?: (line: string) => void, cwd?: string }} [options]
 */
export function captureAction(command, args, logPath, { onCancelReady = () => {}, onOutputLine, cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    let fd
    let child
    try {
      fd = openSync(logPath, 'wx', 0o600)
      child = spawn(command, args, {
        cwd,
        stdio: ['ignore', fd, fd],
        detached: process.platform !== 'win32',
        env: { ...process.env, FORCE_COLOR: '0' }
      })
    } catch (error) {
      if (fd !== undefined) closeSync(fd)
      reject(error)
      return
    }

    let cancelled = false
    const stopProgress = onOutputLine ? followProgress(logPath, onOutputLine) : async () => {}
    let spawnFailed = false
    let killTimer
    function killTree(signal) {
      if (!child.pid) return
      try {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
          killer.on('error', () => child.kill())
        } else {
          process.kill(-child.pid, signal)
        }
      } catch {
        // The process may already have exited.
      }
    }
    const cleanupOnExit = () => killTree('SIGKILL')
    process.once('exit', cleanupOnExit)
    onCancelReady(() => {
      if (cancelled) return
      cancelled = true
      killTree('SIGTERM')
      killTimer = setTimeout(() => killTree('SIGKILL'), 1500)
    })
    child.on('error', (error) => {
      spawnFailed = true
      writeSync(fd, `${error.stack ?? error.message}\n`)
    })
    child.once('close', async (code, signal) => {
      // Also stop descendants that outlived a cancelled command wrapper.
      if (cancelled) killTree('SIGKILL')
      clearTimeout(killTimer)
      process.removeListener('exit', cleanupOnExit)
      closeSync(fd)
      await stopProgress()
      resolve({ code: cancelled ? 130 : spawnFailed ? 1 : (code ?? 1), signal, cancelled })
    })
  })
}

/** Run a command helper without handing the terminal to it. */
export async function runInteractiveAction(action, args, label) {
  const logPath = join(tmpdir(), `grants-tui-${action}-${randomUUID()}.log`)
  const stopDrawing = showBusyMenu(menuItems, `${label}…`, () => cancelActiveAction(), ANSI, menuTitle)
  const progress = createProgressTracker(action, args)
  try {
    const result = await captureAction(
      process.execPath,
      [fileURLToPath(new URL('./action-worker.js', import.meta.url)), JSON.stringify([action, args])],
      logPath,
      {
        onCancelReady: (cancel) => {
          cancelActive = cancel
        },
        onOutputLine: (line) => {
          const message = progress(line)
          if (message) stopDrawing.update(`${message}…`)
        }
      }
    )
    lastRun = { ...result, label, logPath }
    runs.push(lastRun)
    return result.code
  } catch (error) {
    // For example a full/unwritable temp directory; no command was started.
    lastRun = { code: 1, signal: null, cancelled: false, label, logPath: null, error: error.message }
    return 1
  } finally {
    cancelActive = null
    stopDrawing()
  }
}
