// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import { catalogChoices, createStateRefresh, inspectState, stateChanges, stateView } from './state-inspector.js'
import { loadState, saveInspectorSelection } from './cli-state.js'
import { radioMenu, showBusyMenu } from './tui.js'
import { fetchStateCatalog } from './state.js'
import { viewText } from './output.js'

vi.mock('./cli-state.js', () => ({ loadState: vi.fn(), saveInspectorSelection: vi.fn() }))
vi.mock('./tui.js', () => ({ radioMenu: vi.fn(), showBusyMenu: vi.fn() }))
vi.mock('./state.js', async (importOriginal) => ({ ...(await importOriginal()), fetchStateCatalog: vi.fn() }))
vi.mock('./output.js', async (importOriginal) => ({ ...(await importOriginal()), viewText: vi.fn() }))

const document = {
  _id: 'example-id',
  grantCode: 'example-grant',
  grantVersion: '1.0.0',
  state: { applicationStatus: 'CLEARED', answer: false }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadState).mockReturnValue(null)
  vi.mocked(radioMenu).mockResolvedValue('__quit__')
  vi.mocked(showBusyMenu).mockReturnValue(Object.assign(vi.fn(), { update: vi.fn() }))
  vi.mocked(fetchStateCatalog).mockResolvedValue([{ ...document, sbi: '123456789' }])
})

test('shows one document with a styled summary and syntax-highlighted JSON', () => {
  const view = stateView(document, undefined)
  expect(view.text.split('\n')[0]).toBe('Application status: CLEARED')
  expect(view.text).not.toMatch(/GAS|document\(s\)/)
  expect(view.text).toContain('"answer": false')
  expect(view.highlightLines).toEqual([])
  expect(view.summaryLines).toEqual([0])
  expect(JSON.parse(view.text.split('\n').slice(view.jsonStartLine).join('\n'))).toEqual(document)
  expect(stateView({ ...document, state: {} }, undefined).text).toContain('Application status: Pre-submission')
})

test('diffs nested additions, removals, arrays and punctuation in keys without mutating input', () => {
  const before = { nested: { removed: true, 'a/b~': 1 }, list: ['old'], nil: null }
  const after = { nested: { 'a/b~': 2, added: false }, list: [], nil: {} }
  expect(stateChanges(before, after)).toEqual([
    '- /list/0: "old"',
    '- /nested/a~1b~0: 1',
    '+ /nested/a~1b~0: 2',
    '+ /nested/added: false',
    '- /nested/removed: true',
    '- /nil: null',
    '+ /nil: {}'
  ])
  expect(before.nested.removed).toBe(true)
})

test('highlights changed and removed fields', () => {
  expect(stateView(document, document).text).toContain('No changes since previous successful fetch.')
  const view = stateView({ ...document, state: { answer: true } }, document)
  const highlights = view.highlightLines.map((line) => view.text.split('\n')[line])
  expect(highlights).toEqual(
    expect.arrayContaining([
      expect.stringContaining('/state/answer: false'),
      expect.stringContaining('/state/answer: true'),
      expect.stringContaining('/state/applicationStatus: "CLEARED"')
    ])
  )
})

test('reports empty state and detects documents removed since the last fetch', () => {
  const view = stateView(null, document)
  expect(view.text).toContain('No saved state for this version')
  expect(view.text).toContain('Application status: Pre-submission')
  expect(view.highlightLines).toHaveLength(2)
})

test('refresh errors preserve the last successful comparison baseline and retry recovers', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce([document])
    .mockRejectedValueOnce(new Error('MongoDB unavailable'))
    .mockResolvedValueOnce([{ ...document, state: { applicationStatus: 'SUBMITTED', answer: true } }])
  const selection = { grantCode: 'example-grant', sbi: '123456789' }
  const refresh = createStateRefresh(selection, fetch)
  const signal = new AbortController().signal
  await refresh(signal)
  const error = await refresh(signal)
  expect(error.text).toContain('MongoDB unavailable')
  expect(error.text).toContain('snapshot (stale)')
  expect(error.text).toContain('"answer": false')
  expect(error.summaryLines).toEqual([4])
  expect(error.text.split('\n')[error.jsonStartLine ?? -1]).toBe('{')
  const recovered = await refresh(signal)
  expect(recovered.text).toContain('/state/answer: true')
  expect(recovered.text).not.toContain('stale')
  expect(fetch).toHaveBeenLastCalledWith(selection, signal)
})

test('an initial connection failure gives retry guidance', async () => {
  const refresh = createStateRefresh({}, vi.fn().mockRejectedValue(new Error('Docker unavailable')))
  expect((await refresh(new AbortController().signal)).text).toContain('No successful fetch yet.')
})

test('loads grant/SBI menus and always offers the latest version first, ignoring a saved older version', async () => {
  vi.mocked(loadState).mockReturnValue({
    stateInspector: { grantCode: 'example-grant', sbi: '123456789', grantVersion: '1.0.0' }
  })
  vi.mocked(fetchStateCatalog).mockResolvedValue([
    { ...document, sbi: '123456789' },
    { ...document, sbi: '123456789', grantVersion: '1.10.0' },
    { ...document, sbi: '123456789', grantVersion: '1.2.0' },
    { ...document, sbi: '987654321', grantVersion: '3.0.0' }
  ])
  vi.mocked(radioMenu)
    .mockResolvedValueOnce('example-grant')
    .mockResolvedValueOnce('123456789')
    .mockResolvedValueOnce('1.10.0')
  await inspectState()
  expect(radioMenu).toHaveBeenNthCalledWith(
    1,
    expect.any(Array),
    'Select a grant',
    expect.objectContaining({ initialKey: 'example-grant' })
  )
  const calls = vi.mocked(radioMenu).mock.calls
  expect(calls[1][0].map((item) => item.key)).toEqual(['123456789', '987654321'])
  expect(calls[2][0]).toEqual([
    { key: '1.10.0', label: '1.10.0', description: 'Latest' },
    { key: '1.2.0', label: '1.2.0', description: '' },
    { key: '1.0.0', label: '1.0.0', description: '' }
  ])
  expect(calls[2][2]?.initialKey).toBeUndefined()
  expect(saveInspectorSelection).toHaveBeenCalledExactlyOnceWith({
    grantCode: 'example-grant',
    sbi: '123456789',
    grantVersion: '1.10.0'
  })
  expect(viewText).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Application state · read-only', refresh: expect.any(Function) })
  )
})

test.each([0, 1, 2])('back from menu %i returns without saving or querying application answers', async (index) => {
  for (let i = 0; i < index; i++) {
    vi.mocked(radioMenu).mockResolvedValueOnce(i === 0 ? 'example-grant' : '123456789')
  }
  await inspectState()
  expect(saveInspectorSelection).not.toHaveBeenCalled()
  expect(viewText).not.toHaveBeenCalled()
})

test('dry-run never saves or fetches', async () => {
  await inspectState(true)
  expect(fetchStateCatalog).not.toHaveBeenCalled()
  expect(saveInspectorSelection).not.toHaveBeenCalled()
  expect(vi.mocked(viewText).mock.calls[0][0].refresh).toBeUndefined()
})

test('catalog choices deduplicate, scope versions to the SBI, and sort semver including prereleases', () => {
  const rows = ['2.0.0-beta.1', '1.9.0', '2.0.0', '1.10.0', '1.10.0'].map((grantVersion) => ({
    grantCode: 'example',
    sbi: '123456789',
    grantVersion
  }))
  rows.push({ grantCode: 'other', sbi: '987654321', grantVersion: '9.0.0' })
  expect(catalogChoices(rows, undefined, undefined)).toEqual(['example', 'other'])
  expect(catalogChoices(rows, 'example', undefined)).toEqual(['123456789'])
  expect(catalogChoices(rows, 'example', '123456789')).toEqual(['2.0.0', '2.0.0-beta.1', '1.10.0', '1.9.0'])
})

test('empty collection explains how to create saved state', async () => {
  vi.mocked(fetchStateCatalog).mockResolvedValue([])
  await inspectState()
  expect(viewText).toHaveBeenCalledWith(
    expect.objectContaining({ text: expect.stringContaining('No saved grant applications') })
  )
  expect(radioMenu).not.toHaveBeenCalled()
})

test('failed catalog read offers retry and stops the busy menu', async () => {
  vi.mocked(fetchStateCatalog).mockRejectedValueOnce(new Error('MongoDB unavailable'))
  vi.mocked(radioMenu).mockResolvedValueOnce('retry')
  await inspectState()
  expect(fetchStateCatalog).toHaveBeenCalledTimes(2)
  expect(viewText).toHaveBeenCalledWith(expect.objectContaining({ text: 'MongoDB unavailable' }))
  expect(vi.mocked(showBusyMenu).mock.results[0].value).toHaveBeenCalled()
})

test('cancelling catalog loading aborts the query and returns without an error screen', async () => {
  vi.mocked(fetchStateCatalog).mockImplementationOnce(async (signal) => {
    vi.mocked(showBusyMenu).mock.calls[0][2]()
    expect(signal.aborted).toBe(true)
    throw new Error('aborted')
  })
  await inspectState()
  expect(vi.mocked(showBusyMenu).mock.results[0].value).toHaveBeenCalled()
  expect(viewText).not.toHaveBeenCalled()
  expect(radioMenu).not.toHaveBeenCalled()
})

test('each selected version creates a separate refresh baseline and queries only that version', async () => {
  vi.mocked(fetchStateCatalog).mockResolvedValue(
    ['1.0.0', '2.0.0'].map((grantVersion) => ({ ...document, sbi: '123456789', grantVersion }))
  )
  vi.mocked(radioMenu)
    .mockResolvedValueOnce('example-grant')
    .mockResolvedValueOnce('123456789')
    .mockResolvedValueOnce('2.0.0')
    .mockResolvedValueOnce('1.0.0')
  await inspectState()
  const views = vi.mocked(viewText).mock.calls
  expect(views.map(([options]) => options.subtitle)).toEqual([
    'Grant example-grant · SBI 123456789 · Version 2.0.0',
    'Grant example-grant · SBI 123456789 · Version 1.0.0'
  ])
  expect(views[0][0].refresh).not.toBe(views[1][0].refresh)
  const fetch = vi.fn().mockResolvedValue([{ ...document, grantVersion: '2.0.0' }, document])
  const refresh = createStateRefresh({ grantCode: 'example-grant', sbi: '123456789', grantVersion: '2.0.0' }, fetch)
  const signal = new AbortController().signal
  const result = await refresh(signal)
  expect(fetch).toHaveBeenCalledWith({ grantCode: 'example-grant', sbi: '123456789', grantVersion: '2.0.0' }, signal)
  expect(result.text).not.toContain('1.0.0')
})
