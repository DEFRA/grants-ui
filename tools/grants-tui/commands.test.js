// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cmdDebug, cmdDown, cmdReset, cmdUp } from './commands.js'
import { getSelectedFormDefIds, runApplyFormDefs } from './form-defs.js'
import { clearState, loadState } from './cli-state.js'
import { enableTailscaleServe, disableTailscaleServe } from './tailscale-serve.js'
import { runCompose } from './docker.js'

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
vi.mock('./tailscale-serve.js', () => ({
  enableTailscaleServe: vi.fn(() => [443, 8443]),
  disableTailscaleServe: vi.fn(() => 0)
}))

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

test('up configures Tailscale before starting containers', () => {
  expect(cmdUp(['tailscale'], null, false, [], true).status).toBe(0)
  expect(enableTailscaleServe).toHaveBeenCalledWith(false)
  expect(vi.mocked(enableTailscaleServe).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(runCompose).mock.invocationCallOrder[0]
  )
})

test('HA and Tailscale fail before Serve or Docker changes', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(cmdUp(['ha', 'tailscale'], 2, false, [], true).status).toBe(1)
  expect(enableTailscaleServe).not.toHaveBeenCalled()
  expect(runCompose).not.toHaveBeenCalled()
})

test('down removes matching proxies after the containers stop', () => {
  vi.mocked(loadState).mockReturnValueOnce({ addons: ['tailscale'] })
  expect(cmdDown(false, true)).toBe(0)
  expect(disableTailscaleServe).toHaveBeenCalledWith(false)
  expect(vi.mocked(disableTailscaleServe).mock.invocationCallOrder[0]).toBeGreaterThan(
    vi.mocked(runCompose).mock.invocationCallOrder[0]
  )
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
