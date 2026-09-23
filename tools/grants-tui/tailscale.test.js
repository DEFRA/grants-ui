// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cmdTailscale, tailscaleStatusSegment } from './tailscale.js'
import { getRunningComposeFiles, runCompose, tailscaleComposeArgs } from './docker.js'
import { loadState, saveState } from './cli-state.js'
import { disableTailscaleServe, enableTailscaleServe } from './tailscale-serve.js'
import { revokeAllTailscaleSharesSync } from './tailscale-share.js'

vi.mock('./constants.js', async (original) => ({ ...(await original()), BLUE: '\x1b[34m', RESET_COLOR: '\x1b[0m' }))
vi.mock('./docker.js', () => ({
  getRunningComposeFiles: vi.fn(),
  runCompose: vi.fn(),
  tailscaleComposeArgs: vi.fn((files, enabled) => ['-f', enabled ? 'tail.yml' : 'local.yml'])
}))
vi.mock('./cli-state.js', () => ({ loadState: vi.fn(), saveState: vi.fn() }))
vi.mock('./form-defs.js', () => ({ getSelectedFormDefIds: vi.fn(() => ['woodland']) }))
vi.mock('./tailscale-serve.js', () => ({ enableTailscaleServe: vi.fn(), disableTailscaleServe: vi.fn() }))
vi.mock('./tailscale-share.js', () => ({ revokeAllTailscaleSharesSync: vi.fn() }))

const localFiles = ['compose.infra.yml', 'compose.grants-ui.yml', 'compose.land-grants.yml']
const tailFiles = [...localFiles, 'compose.tailscale.yml']

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getRunningComposeFiles).mockReturnValue(localFiles)
  vi.mocked(loadState).mockReturnValue({ addons: ['land-grants'], scale: null, localServices: ['grants-ui-backend'] })
  vi.mocked(runCompose).mockReturnValue(0)
  vi.mocked(enableTailscaleServe).mockReturnValue([443, 8443])
  vi.mocked(disableTailscaleServe).mockReturnValue(0)
  vi.mocked(revokeAllTailscaleSharesSync).mockReturnValue(0)
})
afterEach(() => vi.restoreAllMocks())

test('live enable waits for the stub before recreating UI and preserves selections', () => {
  expect(cmdTailscale(true)).toBe(0)
  expect(tailscaleComposeArgs).toHaveBeenCalledWith(localFiles, true, ['grants-ui-backend'])
  expect(vi.mocked(runCompose).mock.calls.map(([args]) => args)).toEqual([
    ['-f', 'tail.yml', 'up', '-d', '--no-deps', '--force-recreate', '--wait', 'fcp-defra-id-stub'],
    ['-f', 'tail.yml', 'up', '-d', '--no-deps', '--force-recreate', '--wait', 'grants-ui']
  ])
  expect(saveState).toHaveBeenCalledWith(['land-grants', 'tailscale'], null, ['grants-ui-backend'], ['woodland'])
  expect(vi.mocked(enableTailscaleServe).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(runCompose).mock.invocationCallOrder[0]
  )
})

test('disable restores localhost before cleanup, even if cleanup cannot run', () => {
  vi.mocked(getRunningComposeFiles).mockReturnValue(tailFiles)
  vi.mocked(disableTailscaleServe).mockReturnValue(1)
  expect(cmdTailscale(false)).toBe(1)
  expect(runCompose).toHaveBeenCalledTimes(2)
  expect(vi.mocked(disableTailscaleServe).mock.invocationCallOrder[0]).toBeGreaterThan(
    vi.mocked(runCompose).mock.invocationCallOrder[1]
  )
  expect(saveState).toHaveBeenCalledWith(['land-grants'], null, ['grants-ui-backend'], ['woodland'])
})

test('failed switch rolls back both services and newly created proxies without saving mode', () => {
  vi.mocked(runCompose).mockReturnValueOnce(0).mockReturnValueOnce(7)
  expect(cmdTailscale(true)).toBe(7)
  expect(runCompose).toHaveBeenCalledTimes(4)
  expect(tailscaleComposeArgs).toHaveBeenLastCalledWith(localFiles, false, ['grants-ui-backend'])
  expect(disableTailscaleServe).toHaveBeenCalledWith(false, [443, 8443])
  expect(saveState).not.toHaveBeenCalled()
})

test('failed rollback keeps proxies reachable and reports failure', () => {
  vi.mocked(runCompose).mockReturnValue(7)
  expect(cmdTailscale(true)).toBe(7)
  expect(disableTailscaleServe).not.toHaveBeenCalled()
  expect(saveState).not.toHaveBeenCalled()
})

test('Serve failure never changes the running containers or saved mode', () => {
  vi.mocked(enableTailscaleServe).mockImplementation(() => {
    throw new Error('port conflict')
  })
  expect(cmdTailscale(true)).toBe(1)
  expect(runCompose).not.toHaveBeenCalled()
  expect(saveState).not.toHaveBeenCalled()
})

test('HA incompatibility fails before any mutation', () => {
  vi.mocked(getRunningComposeFiles).mockReturnValue([...localFiles, 'compose.ha.yml'])
  expect(cmdTailscale(true)).toBe(1)
  expect(enableTailscaleServe).not.toHaveBeenCalled()
  expect(runCompose).not.toHaveBeenCalled()
  expect(saveState).not.toHaveBeenCalled()
})

test('stopped stack stores selection without starting Docker or Serve', () => {
  vi.mocked(getRunningComposeFiles).mockReturnValue(null)
  expect(cmdTailscale(true)).toBe(0)
  expect(saveState).toHaveBeenCalledWith(['land-grants', 'tailscale'], null, ['grants-ui-backend'], ['woodland'])
  expect(runCompose).not.toHaveBeenCalled()
  expect(enableTailscaleServe).not.toHaveBeenCalled()
})

test('dry-run passes through preview mode and never saves selections', () => {
  expect(cmdTailscale(true, true)).toBe(0)
  expect(enableTailscaleServe).toHaveBeenCalledWith(true)
  expect(runCompose).toHaveBeenCalledWith(expect.any(Array), true)
  expect(saveState).not.toHaveBeenCalled()
})

test('runtime address uses blue, not cyan', () => {
  expect(tailscaleStatusSegment('https://test.example.ts.net')).toBe(
    '\x1b[34mTailscale: https://test.example.ts.net\x1b[0m'
  )
})
