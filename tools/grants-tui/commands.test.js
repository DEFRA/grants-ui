// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cmdDebug, cmdDown, cmdReset, cmdUp } from './commands.js'
import { getSelectedFormDefIds, runApplyFormDefs } from './form-defs.js'
import { clearState, getTailscaleShareIds, loadState } from './cli-state.js'
import { enableTailscaleServe, disableTailscaleServe } from './tailscale-serve.js'
import { revokeAllTailscaleSharesSync } from './tailscale-share.js'
import { composeFileArgs, runCompose } from './docker.js'

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
vi.mock('./cli-state.js', () => ({
  loadState: vi.fn(() => null),
  saveState: vi.fn(),
  clearState: vi.fn(),
  getTailscaleShareIds: vi.fn(() => []),
  saveTailscaleShareIds: vi.fn()
}))
vi.mock('./tailscale-serve.js', () => ({
  enableTailscaleServe: vi.fn(() => [443, 8443]),
  disableTailscaleServe: vi.fn(() => 0)
}))
vi.mock('./tailscale-share.js', () => ({ revokeAllTailscaleSharesSync: vi.fn(() => 0) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

test('up reports a failed override apply instead of success after Docker started', () => {
  vi.mocked(getSelectedFormDefIds).mockReturnValueOnce(['example'])
  vi.mocked(runApplyFormDefs).mockReturnValueOnce(8)
  expect(cmdUp([], null, false, []).status).toBe(8)
  expect(runApplyFormDefs).toHaveBeenCalledTimes(1)
})

test('up configures Tailscale before starting containers', () => {
  expect(cmdUp(['tailscale'], null, false, []).status).toBe(0)
  expect(enableTailscaleServe).toHaveBeenCalledWith(false)
  expect(vi.mocked(enableTailscaleServe).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(runCompose).mock.invocationCallOrder[0]
  )
})

test('HA and Tailscale fail before Serve or Docker changes', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(cmdUp(['ha', 'tailscale'], 2, false, []).status).toBe(1)
  expect(enableTailscaleServe).not.toHaveBeenCalled()
  expect(runCompose).not.toHaveBeenCalled()
})

test('down removes matching proxies after the containers stop', () => {
  vi.mocked(loadState).mockReturnValueOnce({ addons: ['tailscale'], tailscaleShareIds: ['share-1'] })
  vi.mocked(getTailscaleShareIds).mockReturnValueOnce(['share-1'])
  expect(cmdDown(false)).toBe(0)
  expect(revokeAllTailscaleSharesSync).toHaveBeenCalledWith(false)
  expect(vi.mocked(revokeAllTailscaleSharesSync).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(runCompose).mock.invocationCallOrder[0]
  )
  expect(disableTailscaleServe).toHaveBeenCalledWith(false)
  expect(vi.mocked(disableTailscaleServe).mock.invocationCallOrder[0]).toBeGreaterThan(
    vi.mocked(runCompose).mock.invocationCallOrder[0]
  )
})

test('down omits the Tailscale environment overlay from Compose interpolation', () => {
  vi.mocked(loadState).mockReturnValueOnce({ addons: ['land-grants', 'tailscale'] })

  expect(cmdDown(false)).toBe(0)

  expect(composeFileArgs).toHaveBeenCalledWith(['land-grants'], [])
})

test('down leaves the stack running when a share cannot be revoked', () => {
  vi.mocked(loadState).mockReturnValueOnce({ addons: ['tailscale'], tailscaleShareIds: ['share-1'] })
  vi.mocked(getTailscaleShareIds).mockReturnValueOnce(['share-1'])
  vi.mocked(revokeAllTailscaleSharesSync).mockReturnValueOnce(1)
  vi.spyOn(console, 'error').mockImplementation(() => {})

  expect(cmdDown(false)).toBe(1)
  expect(runCompose).not.toHaveBeenCalled()
  expect(disableTailscaleServe).not.toHaveBeenCalled()
})

test('debug dry-run does not execute any Docker commands', () => {
  expect(cmdDebug(true)).toBe(0)
  expect(spawnSync).not.toHaveBeenCalled()
})

test('debug preserves the stop failure and does not attempt to restart', () => {
  vi.mocked(spawnSync).mockReturnValueOnce({ status: 9, stdout: '', stderr: '', pid: 1, output: [], signal: null })
  expect(cmdDebug()).toBe(9)
  expect(spawnSync).toHaveBeenCalledTimes(1)
})

test('reset returns a teardown failure but completes independent cleanup', () => {
  vi.mocked(spawnSync).mockReturnValueOnce({ status: 17, stdout: '', stderr: '', pid: 1, output: [], signal: null })
  expect(cmdReset(false)).toBe(17)
  expect(spawnSync).toHaveBeenCalledWith(
    'docker',
    ['compose', '-f', expect.any(String), 'down', '--volumes'],
    expect.objectContaining({ cwd: expect.any(String), stdio: 'inherit' })
  )
  expect(clearState).toHaveBeenCalledOnce()
})

test('reset supplies the core stack before the Land Grants overlay', () => {
  expect(cmdReset(false)).toBe(0)
  expect(spawnSync).toHaveBeenNthCalledWith(
    1,
    'docker',
    [
      'compose',
      '-f',
      'compose.infra.yml',
      '-f',
      'compose.grants-ui.yml',
      'down',
      '--volumes',
      '--remove-orphans',
      '--rmi',
      'local'
    ],
    expect.objectContaining({ cwd: expect.any(String), stdio: 'inherit' })
  )
  expect(spawnSync).toHaveBeenNthCalledWith(
    2,
    'docker',
    [
      'compose',
      '-f',
      'compose.infra.yml',
      '-f',
      'compose.grants-ui.yml',
      '-f',
      'compose.land-grants.yml',
      'down',
      '--volumes',
      '--remove-orphans',
      '--rmi',
      'local'
    ],
    expect.objectContaining({ cwd: expect.any(String), stdio: 'inherit' })
  )
})

test('reset dry-run does not query or change Docker', () => {
  expect(cmdReset(true)).toBe(0)
  expect(spawnSync).not.toHaveBeenCalled()
})
