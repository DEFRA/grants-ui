// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { loadState } from './cli-state.js'
import { runRefreshExamples } from './form-defs.js'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('./cli-state.js', () => ({ loadState: vi.fn(() => null) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

test('manual refresh reapplies selected example overrides but leaves real grant overrides alone', () => {
  vi.mocked(loadState).mockReturnValueOnce({
    addons: [],
    scale: null,
    localServices: [],
    localFormDefSelections: ['example-grant-with-auth::local', 'woodland::repo:grants-config-woodland']
  })
  expect(runRefreshExamples()).toBe(0)
  expect(spawnSync).toHaveBeenCalledTimes(2)
  expect(vi.mocked(spawnSync).mock.calls[1][2]?.env?.GRANTS_UI_FORMDEF_SELECTION).toBe('example-grant-with-auth::local')
})

test('startup refresh lets the caller reconcile overrides afterwards', () => {
  expect(runRefreshExamples(false, false, false)).toBe(0)
  expect(loadState).not.toHaveBeenCalled()
  expect(spawnSync).toHaveBeenCalledOnce()
})

test('explicit reset is forwarded to the refresh script', () => {
  expect(runRefreshExamples(false, true)).toBe(0)
  expect(vi.mocked(spawnSync).mock.calls[0][1]).toContain('--reset-applications')
})

test('refresh failure does not reapply overrides and returns the child exit code', () => {
  vi.mocked(spawnSync).mockReturnValueOnce({ status: 7, stdout: '', stderr: '', pid: 1, output: [], signal: null })
  expect(runRefreshExamples()).toBe(7)
  expect(loadState).not.toHaveBeenCalled()
  expect(spawnSync).toHaveBeenCalledOnce()
})

test('dry-run does not start a process or load persisted selections', () => {
  expect(runRefreshExamples(true)).toBe(0)
  expect(spawnSync).not.toHaveBeenCalled()
  expect(loadState).not.toHaveBeenCalled()
})
