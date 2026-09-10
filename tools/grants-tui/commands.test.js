// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cmdDebug, cmdReset, cmdUp } from './commands.js'
import { getSelectedFormDefIds, runApplyFormDefs } from './form-defs.js'
import { clearState } from './cli-state.js'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('node:fs', () => ({ writeFileSync: vi.fn(), unlinkSync: vi.fn() }))
vi.mock('./docker.js', () => ({
  composeFileArgs: vi.fn(() => []),
  getLocalImages: vi.fn(() => new Set()),
  getRunningComposeFiles: vi.fn(() => ['compose.infra.yml']),
  runCompose: vi.fn(() => 0)
}))
vi.mock('./form-defs.js', () => ({
  hasLocalFormDefs: vi.fn(() => false),
  getSelectedFormDefIds: vi.fn(() => []),
  runApplyFormDefs: vi.fn(() => 0)
}))
vi.mock('./cli-state.js', () => ({ loadState: vi.fn(() => null), saveState: vi.fn(), clearState: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

test('up reports a failed override apply instead of success after Docker started', () => {
  vi.mocked(getSelectedFormDefIds).mockReturnValueOnce(['example'])
  vi.mocked(runApplyFormDefs).mockReturnValueOnce(8)
  expect(cmdUp([], null, false, [], true).status).toBe(8)
  expect(runApplyFormDefs).toHaveBeenCalledTimes(1)
})

test('debug dry-run does not execute any Docker commands', () => {
  expect(cmdDebug(true, true)).toBe(0)
  expect(spawnSync).not.toHaveBeenCalled()
})

test('debug preserves the stop failure and does not attempt to restart', () => {
  vi.mocked(spawnSync).mockReturnValueOnce({ status: 9, stdout: '', stderr: '', pid: 1, output: [], signal: null })
  expect(cmdDebug(true)).toBe(9)
  expect(spawnSync).toHaveBeenCalledTimes(1)
})

test('reset returns a teardown failure and preserves saved state', () => {
  vi.mocked(spawnSync).mockReturnValueOnce({ status: 17, stdout: '', stderr: '', pid: 1, output: [], signal: null })
  expect(cmdReset(false)).toBe(17)
  expect(clearState).not.toHaveBeenCalled()
})
