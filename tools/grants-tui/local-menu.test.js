// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import { stripVTControlCharacters } from 'node:util'
import { buildMainMenuItems, handleLocalCommand, handleRefreshOverridesCommand, runCommandHandler } from './tui-loop.js'
import { getLocalImages, getRunningServices } from './docker.js'
import { getLocalServiceRepo } from './local-images.js'
import { emptyState, loadState, saveState } from './cli-state.js'
import { toggleMenu } from './tui.js'
import { getLastRun, runInteractiveAction } from './actions.js'

vi.mock('./local-images.js', () => ({ getLocalServiceRepo: vi.fn() }))
vi.mock('./cli-state.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadState: vi.fn(),
  saveState: vi.fn()
}))
vi.mock('./form-defs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listOverrideSources: vi.fn(() => [])
}))
vi.mock('./docker.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getLocalImages: vi.fn(),
  getRunningServices: vi.fn()
}))
vi.mock('./tui.js', async (importOriginal) => ({ ...(await importOriginal()), toggleMenu: vi.fn() }))
vi.mock('./actions.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runInteractiveAction: vi.fn(),
  getLastRun: vi.fn()
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getLocalImages).mockReturnValue(new Set())
  vi.mocked(getLocalServiceRepo).mockReturnValue(null)
  vi.mocked(loadState).mockReturnValue(null)
  vi.mocked(runInteractiveAction).mockResolvedValue(0)
  vi.mocked(getRunningServices).mockReturnValue([])
})

test('offers sibling builds and existing images, disabling unavailable services', async () => {
  vi.mocked(getLocalImages).mockReturnValue(new Set(['grants-config-broker:local']))
  vi.mocked(getLocalServiceRepo).mockImplementation((key) =>
    key === 'grants-ui-backend' ? '/checkouts/grants-ui-backend' : null
  )
  vi.mocked(toggleMenu).mockResolvedValueOnce(null)

  expect(await handleLocalCommand(false, { localServices: ['grants-config-broker'] }, false)).toBe('')
  const items = vi.mocked(toggleMenu).mock.calls[0][0]
  expect(items.find((item) => item.key === 'grants-ui-backend')).toMatchObject({
    description: 'build from ../grants-ui-backend on apply',
    disabled: false,
    selected: false
  })
  expect(items.find((item) => item.key === 'grants-config-broker')).toMatchObject({
    description: 'local image available',
    disabled: false,
    selected: true
  })
  expect(items.find((item) => item.key === 'grants-platform-dal-stub')).toMatchObject({ disabled: true })
  expect(runInteractiveAction).not.toHaveBeenCalled()
  expect(saveState).not.toHaveBeenCalled()
})

test.each([false, true])('builds selected missing images before saving overrides (dryRun=%s)', async (dryRun) => {
  vi.mocked(getLocalServiceRepo).mockReturnValue('/checkouts/grants-ui-backend')
  vi.mocked(toggleMenu).mockImplementationOnce(async (items) =>
    items.map((item) => ({ ...item, selected: item.key === 'grants-ui-backend' }))
  )
  await handleLocalCommand(dryRun, null, false)
  expect(runInteractiveAction).toHaveBeenCalledExactlyOnceWith(
    'build-local-image',
    ['grants-ui-backend', dryRun],
    'Building grants-ui-backend:local'
  )
  expect(saveState).toHaveBeenCalledWith([], null, ['grants-ui-backend'], [])
  expect(vi.mocked(runInteractiveAction).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(saveState).mock.invocationCallOrder[0]
  )
})

test.each([1, 130])('failed or cancelled build (%s) preserves selections and the running stack', async (status) => {
  vi.mocked(getLocalServiceRepo).mockReturnValue('/checkouts/grants-ui-backend')
  vi.mocked(toggleMenu).mockImplementationOnce(async (items) =>
    items.map((item) => ({ ...item, selected: item.key === 'grants-ui-backend' }))
  )
  vi.mocked(runInteractiveAction).mockResolvedValueOnce(status)
  expect(await handleLocalCommand(false, null, true)).toContain('selections not saved')
  expect(saveState).not.toHaveBeenCalled()
  expect(runInteractiveAction).toHaveBeenCalledTimes(1)
  expect(getRunningServices).not.toHaveBeenCalled()
})

test('reuses existing images without building and restarts the changed running service', async () => {
  vi.mocked(getLocalImages).mockReturnValue(new Set(['grants-ui-backend:local']))
  vi.mocked(getRunningServices).mockReturnValue(['grants-ui-backend'])
  vi.mocked(toggleMenu).mockImplementationOnce(async (items) =>
    items.map((item) => ({ ...item, selected: item.key === 'grants-ui-backend' }))
  )
  await handleLocalCommand(false, null, true)
  expect(saveState).toHaveBeenCalledWith([], null, ['grants-ui-backend'], [])
  expect(runInteractiveAction).toHaveBeenCalledExactlyOnceWith(
    'restart',
    [['grants-ui-backend'], false, true],
    'Restarting local services'
  )
})

test.each([
  [['grants-ui-backend'], [], 'Rebuild local images & restart services'],
  [[], ['woodland::local'], 'Re-apply local form-def overrides'],
  [['grants-ui-backend'], ['woodland::local'], 'Rebuild images, restart services & re-apply form-def overrides']
])(
  'refresh appears for enabled images or form definitions (%j, %j)',
  (localServices, localFormDefSelections, description) => {
    const state = { localServices, localFormDefSelections }
    expect(buildMainMenuItems(state, true).find((item) => item.key === 'refresh-overrides')).toMatchObject({
      description,
      disabled: false
    })
    expect(buildMainMenuItems(state, false).find((item) => item.key === 'refresh-overrides')).toMatchObject({
      description: 'Start containers first to refresh overrides',
      disabled: true
    })
  }
)

test('refresh is absent when no overrides are enabled', () => {
  expect(buildMainMenuItems(null, true).find((item) => item.key === 'refresh-overrides')).toBeUndefined()
})

test.each([false, true])(
  'refresh rebuilds all enabled images before restarting and re-applying form definitions (dryRun=%s)',
  async (dryRun) => {
    vi.mocked(loadState).mockReturnValue({
      ...emptyState(),
      localServices: ['grants-ui-backend', 'land-grants-api', 'grants-scoring-api'],
      localFormDefSelections: ['woodland::local']
    })
    vi.mocked(getRunningServices).mockReturnValue(['grants-ui', 'grants-ui-backend', 'land-grants-backend'])

    const status = stripVTControlCharacters(await handleRefreshOverridesCommand(dryRun))

    expect(vi.mocked(runInteractiveAction).mock.calls).toEqual([
      ['build-local-image', ['grants-ui-backend', dryRun], 'Rebuilding grants-ui-backend:local'],
      ['build-local-image', ['land-grants-api', dryRun], 'Rebuilding land-grants-api:local'],
      ['build-local-image', ['grants-scoring-api', dryRun], 'Rebuilding grants-scoring-api:local'],
      [
        'restart',
        [['grants-ui-backend', 'land-grants-backend'], dryRun, true],
        'Restarting services with rebuilt local images'
      ],
      ['form-defs', ['enable', dryRun, ['woodland::local']], 'Re-applying form-def overrides']
    ])
    expect(status).toBe(
      dryRun
        ? '✔  Override refresh preview: rebuild 3 local images · restart grants-ui-backend, land-grants-backend · re-apply 1 form-def override'
        : '✔  Overrides refreshed: rebuilt 3 local images · restarted grants-ui-backend, land-grants-backend · re-applied 1 form-def override'
    )
    expect(saveState).not.toHaveBeenCalled()
  }
)

test('image-only refresh rebuilds even an existing image and skips form definitions', async () => {
  vi.mocked(loadState).mockReturnValue({ ...emptyState(), localServices: ['grants-ui-backend'] })
  vi.mocked(getLocalImages).mockReturnValue(new Set(['grants-ui-backend:local']))
  expect(stripVTControlCharacters(await handleRefreshOverridesCommand(false))).toBe(
    '✔  Overrides refreshed: rebuilt 1 local image'
  )
  expect(runInteractiveAction).toHaveBeenCalledExactlyOnceWith(
    'build-local-image',
    ['grants-ui-backend', false],
    'Rebuilding grants-ui-backend:local'
  )
})

test('form-definition-only refresh keeps re-applying the selected overrides', async () => {
  vi.mocked(loadState).mockReturnValue({ ...emptyState(), localFormDefSelections: ['woodland::local'] })
  expect(stripVTControlCharacters(await handleRefreshOverridesCommand(false))).toBe(
    '✔  Overrides refreshed: re-applied 1 form-def override'
  )
  expect(runInteractiveAction).toHaveBeenCalledExactlyOnceWith(
    'form-defs',
    ['enable', false, ['woodland::local']],
    'Re-applying form-def overrides'
  )
})

test.each([1, 130])('refresh stops on a failed or cancelled rebuild (%s)', async (status) => {
  vi.mocked(loadState).mockReturnValue({
    ...emptyState(),
    localServices: ['grants-ui-backend', 'land-grants-api'],
    localFormDefSelections: ['woodland::local']
  })
  vi.mocked(runInteractiveAction).mockResolvedValueOnce(0).mockResolvedValueOnce(status)
  expect(await handleRefreshOverridesCommand(false)).toContain('rebuild failed or cancelled for land-grants-api:local')
  expect(runInteractiveAction).toHaveBeenCalledTimes(2)
  expect(getRunningServices).not.toHaveBeenCalled()
  expect(saveState).not.toHaveBeenCalled()
})

test('refresh stops before publishing form definitions if restarting the rebuilt service fails', async () => {
  vi.mocked(loadState).mockReturnValue({
    ...emptyState(),
    localServices: ['grants-ui-backend'],
    localFormDefSelections: ['woodland::local']
  })
  vi.mocked(getRunningServices).mockReturnValue(['grants-ui-backend'])
  vi.mocked(runInteractiveAction).mockResolvedValueOnce(0).mockResolvedValueOnce(1)
  expect(await handleRefreshOverridesCommand(false)).toContain(
    'Local images rebuilt; service restart failed or cancelled'
  )
  expect(runInteractiveAction).toHaveBeenCalledTimes(2)
})

test('refresh reports form-definition failure after rebuilding images', async () => {
  vi.mocked(loadState).mockReturnValue({
    ...emptyState(),
    localServices: ['grants-ui-backend'],
    localFormDefSelections: ['woodland::local']
  })
  vi.mocked(runInteractiveAction).mockResolvedValueOnce(0).mockResolvedValueOnce(1)
  expect(await handleRefreshOverridesCommand(false)).toContain(
    'rebuilt 1 local image; Form-def override refresh failed or cancelled'
  )
})

test('refresh with no overrides does nothing and reports it', async () => {
  expect(stripVTControlCharacters(await handleRefreshOverridesCommand(false))).toBe('No local overrides enabled')
  expect(runInteractiveAction).not.toHaveBeenCalled()
})

test('the main menu preserves the complete refresh summary after the final action', async () => {
  vi.mocked(loadState).mockReturnValue({
    ...emptyState(),
    localServices: ['grants-ui-backend'],
    localFormDefSelections: ['woodland::local']
  })
  vi.mocked(runInteractiveAction).mockImplementation(async (action, args, label) => {
    vi.mocked(getLastRun).mockReturnValue({
      code: 0,
      signal: null,
      cancelled: false,
      label,
      logPath: '/tmp/refresh.log'
    })
    return 0
  })
  const status = await runCommandHandler(() => handleRefreshOverridesCommand(false), {}, null, true)
  expect(stripVTControlCharacters(status)).toBe(
    '✔  Overrides refreshed: rebuilt 1 local image · re-applied 1 form-def override'
  )
})
