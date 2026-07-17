/* eslint-disable no-console, curly */

import { spawnSync } from 'node:child_process'
import * as os from 'node:os'
import { resolve } from 'node:path'

import { DIM, RED, RESET_COLOR, ROOT, TEST_TARGETS } from './constants.js'

/**
 * Where a test suite's combined output is tee'd. The interactive menu runs inside
 * the alternate screen buffer and clears it on return, so streamed output is lost
 * from scroll-back.
 * @param {string} targetKey  one of TEST_TARGETS[].key
 * @returns {string}  absolute path to the target's tee'd log file
 */
export function testLogPath(targetKey) {
  return resolve(os.tmpdir(), `grants-tui-test-${targetKey}.log`)
}

/**
 * Run a test target (`npm run <script>`) with inherited stdio so vitest output
 * streams straight to the terminal. Returns the child exit code (0 = pass).
 * @param {string} targetKey  one of TEST_TARGETS[].key
 * @param {boolean} [dryRun]  print the command without running it
 * @returns {number}  child exit code (0 = pass, 1 = fail/unknown target)
 */
export function cmdTest(targetKey, dryRun = false) {
  const target = TEST_TARGETS.find((t) => t.key === targetKey)
  if (!target) {
    console.error(`\n  ${RED}✖${RESET_COLOR}  Unknown test target: '${targetKey}'\n`)
    return 1
  }
  console.log(`\n  ${DIM}▶${RESET_COLOR}  npm run ${target.script}  ${DIM}(${target.description})${RESET_COLOR}\n`)
  if (dryRun) return 0
  const env = { ...process.env, ...target.env }

  if (process.platform === 'win32') {
    const result = spawnSync('npm.cmd', ['run', target.script], { cwd: ROOT, stdio: 'inherit', encoding: 'utf8', env })
    return result.status ?? 1
  }
  const logFile = testLogPath(targetKey)
  const result = spawnSync('bash', ['-c', `set -o pipefail; npm run ${target.script} 2>&1 | tee "${logFile}"`], {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
    env
  })

  console.log(`\n  ${DIM}output: ${logFile}${RESET_COLOR}`)
  return result.status ?? 1
}
