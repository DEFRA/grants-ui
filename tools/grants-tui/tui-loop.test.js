// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import { stripVTControlCharacters } from 'node:util'
import { buildMainMenuItems, handleChecksCommand, handleToolsCommand, refreshRuntimeStatus } from './tui-loop.js'
import { radioMenu, setRuntimeStatusLine, toggleMenu } from './tui.js'
import { getRunningComposeFiles, getRunningAppBaseUrl } from './docker.js'
import { getGasStatus } from './gas.js'
import { getLastRun, runInteractiveAction, setActionMenu } from './actions.js'
import { viewOutput } from './output.js'
import { inspectState } from './state-inspector.js'

vi.mock('./tui.js', () => ({ radioMenu: vi.fn(), toggleMenu: vi.fn(), setRuntimeStatusLine: vi.fn() }))
vi.mock('./docker.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getRunningComposeFiles: vi.fn(),
  getRunningAppBaseUrl: vi.fn(() => 'https://test.example.ts.net')
}))
vi.mock('./gas.js', async (importOriginal) => ({ ...(await importOriginal()), getGasStatus: vi.fn() }))
vi.mock('./actions.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runInteractiveAction: vi.fn(),
  getLastRun: vi.fn(),
  setActionMenu: vi.fn()
}))
vi.mock('./output.js', () => ({ viewOutput: vi.fn() }))
vi.mock('./state-inspector.js', () => ({ inspectState: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(runInteractiveAction).mockResolvedValue(0)
  vi.mocked(getLastRun).mockReturnValue(null)
  vi.mocked(radioMenu).mockResolvedValue('__quit__')
  vi.mocked(getRunningComposeFiles).mockReturnValue(null)
  vi.mocked(getGasStatus).mockResolvedValue('RECEIVED')
})

test('the main menu groups checks into one entry', () => {
  const keys = buildMainMenuItems(null, false).map((item) => item.key)
  expect(keys).toContain('checks')
  expect(keys).not.toEqual(expect.arrayContaining(['lint']))
  expect(keys.filter((key) => ['format', 'test', 'sonar', 'snyk', 'check'].includes(key))).toEqual([])
})

test('Tailscale toggle is available while running and reflects the actual mode', () => {
  const item = buildMainMenuItems(null, true, true).find((i) => i.key === 'tailscale')
  expect(item).toMatchObject({ label: 'tailscale', description: expect.stringContaining('Disable') })
  expect(item.disabled).toBeUndefined()
  expect(buildMainMenuItems(null, true, false).find((i) => i.key === 'tailscale').description).toContain('Enable')
})

test('Tailscale toggle is disabled with an install hint when unavailable at startup', () => {
  const item = buildMainMenuItems(null, false, false, { available: false, description: 'Install Tailscale CLI' }).find(
    (i) => i.key === 'tailscale'
  )
  expect(item).toMatchObject({ disabled: true, description: 'Install Tailscale CLI' })
})

test('Tailscale address follows GAS in the persistent runtime footer', async () => {
  await refreshRuntimeStatus(['compose.infra.yml', 'compose.grants-ui.yml', 'compose.tailscale.yml'])
  const text = String(vi.mocked(setRuntimeStatusLine).mock.lastCall?.[0])
  expect(stripVTControlCharacters(text)).toContain('GAS: RECEIVED  │  Tailscale: https://test.example.ts.net')
  expect(text).not.toContain('\n')
  expect(getRunningAppBaseUrl).toHaveBeenCalledTimes(1)
})

test('Tailscale footer disappears after disabling, regardless of saved selection', async () => {
  await refreshRuntimeStatus(['compose.infra.yml', 'compose.grants-ui.yml'])
  expect(setRuntimeStatusLine).toHaveBeenCalledWith(expect.not.stringContaining('Tailscale:'))
  expect(getRunningAppBaseUrl).not.toHaveBeenCalled()
})

test('checks exposes each suite directly and escape starts no action', async () => {
  vi.mocked(radioMenu).mockResolvedValue('__quit__')
  await expect(handleChecksCommand(false)).resolves.toBe('')
  const items = vi.mocked(radioMenu).mock.calls[0][0]
  expect(items.map((item) => item.key)).toEqual([
    'format',
    'lint',
    'test:unit',
    'test:contracts',
    'test:acceptance',
    'all-tests',
    'sonar',
    'snyk',
    'check'
  ])
  expect(items.some((item) => item.label.includes('⇢'))).toBe(false)
  expect(runInteractiveAction).not.toHaveBeenCalled()
})

test('the tools submenu exposes audit scripts with descriptions and escape starts no action', async () => {
  expect(buildMainMenuItems(null, false)).toContainEqual(expect.objectContaining({ key: 'tools', label: 'tools ⇢' }))
  await expect(handleToolsCommand(false)).resolves.toBe('')
  const items = vi.mocked(radioMenu).mock.calls[0][0]
  expect(items.map((item) => item.key)).toEqual(['state', 'audit:logs', 'audit:queue', 'audit:clear'])
  expect(items.every((item) => item.description.length > 0)).toBe(true)
  expect(items[3].description).toMatch(/Purge.*queue.*restart grants-ui/)
  expect(runInteractiveAction).not.toHaveBeenCalled()
})

test('application state opens the inspector and returns to Tools without starting a worker', async () => {
  vi.mocked(radioMenu).mockResolvedValueOnce('state')
  await handleToolsCommand(false)
  expect(inspectState).toHaveBeenCalledExactlyOnceWith(false)
  expect(runInteractiveAction).not.toHaveBeenCalled()
  expect(vi.mocked(radioMenu).mock.calls.map((call) => call[1])).toEqual(['Tools', 'Tools'])
})

test.each(['audit:logs', 'audit:queue', 'audit:clear'])(
  '%s runs and returns to Tools with output available',
  async (action) => {
    const completed = { label: action, code: 0, logPath: '/tmp/gt-audit.log' }
    vi.mocked(radioMenu).mockResolvedValueOnce(action).mockResolvedValueOnce('__output__')
    vi.mocked(runInteractiveAction).mockImplementationOnce(async () => {
      vi.mocked(getLastRun).mockReturnValue(completed)
      return 0
    })

    await expect(handleToolsCommand(true)).resolves.toContain('completed')

    expect(runInteractiveAction).toHaveBeenCalledExactlyOnceWith(action, [true], expect.any(String))
    expect(vi.mocked(radioMenu).mock.calls.map((call) => call[1])).toEqual(['Tools', 'Tools', 'Tools'])
    expect(vi.mocked(radioMenu).mock.calls[1][2]).toMatchObject({ outputAvailable: true })
    expect(setActionMenu).toHaveBeenCalledWith(expect.any(Array), 'Tools')
    expect(viewOutput).toHaveBeenCalledWith(completed)
    expect(viewOutput).toHaveBeenCalledTimes(action === 'audit:clear' ? 1 : 2)
  }
)

test.each(['audit:logs', 'audit:queue', 'audit:clear'])(
  '%s opens output automatically only for audit reads, before returning to Tools',
  async (action) => {
    const completed = { label: action, code: 0, logPath: '/tmp/gt-audit.log' }
    vi.mocked(radioMenu).mockResolvedValueOnce(action)
    vi.mocked(runInteractiveAction).mockImplementationOnce(async () => {
      expect(viewOutput).not.toHaveBeenCalled()
      vi.mocked(getLastRun).mockReturnValue(completed)
      return 0
    })

    await handleToolsCommand(false)

    if (action === 'audit:clear') {
      expect(viewOutput).not.toHaveBeenCalled()
    } else {
      expect(viewOutput).toHaveBeenCalledExactlyOnceWith(completed)
      expect(vi.mocked(viewOutput).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(radioMenu).mock.invocationCallOrder[1]
      )
    }
    expect(vi.mocked(radioMenu).mock.calls.map((call) => call[1])).toEqual(['Tools', 'Tools'])
  }
)

test.each([
  ['format', 'format', [true]],
  ['lint', 'lint', [true]],
  ['test:unit', 'test', ['unit', true]],
  ['test:contracts', 'test', ['contracts', true]],
  ['test:acceptance', 'test', ['acceptance', true]],
  ['all-tests', 'all-tests', [true]],
  ['sonar', 'sonar', [{ dryRun: true }]],
  ['snyk', 'snyk', [true]],
  ['check', 'check', [true]]
])('%s starts its action without a nested menu', async (selection, action, args) => {
  vi.mocked(radioMenu).mockResolvedValueOnce(String(selection))
  await handleChecksCommand(true)
  expect(runInteractiveAction).toHaveBeenCalledExactlyOnceWith(action, args, expect.any(String))
  expect(radioMenu).toHaveBeenCalledTimes(2)
  expect(vi.mocked(radioMenu).mock.calls.every((call) => call[1] === 'Checks')).toBe(true)
  expect(setActionMenu).toHaveBeenCalledWith(expect.any(Array), 'Checks')
  expect(toggleMenu).not.toHaveBeenCalled()
})

test('checks keeps failures and output in the submenu and lets the user run another check', async () => {
  vi.mocked(radioMenu).mockResolvedValueOnce('lint').mockResolvedValueOnce('__output__').mockResolvedValueOnce('format')
  const failed = { label: 'Running lint checks', code: 1, logPath: '/tmp/gt-lint.log' }
  const passed = { label: 'Formatting code and docs', code: 0, logPath: '/tmp/gt-format.log' }
  vi.mocked(runInteractiveAction)
    .mockImplementationOnce(async () => {
      vi.mocked(getLastRun).mockReturnValue(failed)
      return 1
    })
    .mockImplementationOnce(async () => {
      vi.mocked(getLastRun).mockReturnValue(passed)
      return 0
    })

  await expect(handleChecksCommand(false)).resolves.toContain('completed')

  const prompts = vi.mocked(radioMenu).mock.calls
  expect(prompts.map((call) => call[1])).toEqual(['Checks', 'Checks', 'Checks', 'Checks'])
  expect(prompts[1][2]).toMatchObject({ statusLine: expect.stringContaining('failed (exit 1)'), outputAvailable: true })
  expect(prompts[2][2]?.statusLine).toBe(prompts[1][2]?.statusLine)
  expect(prompts[3][2]?.statusLine).toContain('completed')
  expect(viewOutput).toHaveBeenCalledExactlyOnceWith(failed)
  expect(runInteractiveAction).toHaveBeenCalledTimes(2)
})

test('checks refreshes runtime separately from the command result after an action', async () => {
  vi.mocked(getRunningComposeFiles)
    .mockReturnValueOnce(['compose.infra.yml', 'compose.grants-ui.yml', 'compose.land-grants.yml'])
    .mockReturnValueOnce(null)
  vi.mocked(radioMenu).mockResolvedValueOnce('test:acceptance')
  vi.mocked(runInteractiveAction).mockImplementationOnce(async () => {
    vi.mocked(getLastRun).mockReturnValue({ label: 'Acceptance tests', code: 0, logPath: '/tmp/gt-tests.log' })
    return 0
  })
  await handleChecksCommand(false)
  expect(setRuntimeStatusLine).toHaveBeenNthCalledWith(1, expect.stringContaining('Land Grants'))
  expect(setRuntimeStatusLine).toHaveBeenNthCalledWith(1, expect.stringContaining('RECEIVED'))
  expect(setRuntimeStatusLine).toHaveBeenNthCalledWith(2, expect.stringContaining('No containers running'))
  const status = vi.mocked(radioMenu).mock.calls[1][2]?.statusLine
  expect(status).toContain('completed')
  expect(status).toContain('output')
  expect(status).not.toMatch(/Running:|GAS:/)
})
