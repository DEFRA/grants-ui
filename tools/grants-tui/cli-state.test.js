// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import * as fs from 'node:fs'
import { loadState, saveInspectorSelection, saveState, saveTailscaleShareIds, STATE_VERSION } from './cli-state.js'
import { STATE_FILE } from './constants.js'

vi.mock('node:fs', () => ({ chmodSync: vi.fn(), existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn() }))

const written = () => JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0][1]))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fs.existsSync).mockReturnValue(true)
})

test('saving inspector preferences preserves stack selections and never persists query results', () => {
  vi.mocked(fs.readFileSync).mockReturnValue(
    JSON.stringify({ addons: ['gas'], scale: 2, localServices: ['example'], localFormDefSelections: ['example-grant'] })
  )
  const selection = { grantCode: 'example-grant', sbi: '123456789', grantVersion: '' }
  saveInspectorSelection(selection)
  expect(written()).toEqual({
    addons: ['gas'],
    scale: 2,
    localServices: ['example'],
    localFormDefSelections: ['example-grant'],
    stateInspector: selection,
    version: STATE_VERSION
  })
})

test('saving stack choices preserves inspector preferences', () => {
  const selection = { grantCode: 'example-grant', sbi: '123456789', grantVersion: '1.0.0' }
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ addons: [], stateInspector: selection }))
  saveState(['land-grants'], null, [], [])
  expect(JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0][1]))).toMatchObject({
    addons: ['land-grants'],
    stateInspector: selection
  })
})

test('first-time inspector preferences include defaults required by stack menus', () => {
  vi.mocked(fs.existsSync).mockReturnValue(false)
  saveInspectorSelection({ grantCode: 'example-grant', sbi: '123456789', grantVersion: '' })
  expect(JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0][1]))).toMatchObject({
    addons: [],
    scale: null,
    localServices: [],
    localFormDefSelections: []
  })
})

test.each([
  ['stack choices', () => saveState(['gas'], null)],
  ['Tailscale share IDs', () => saveTailscaleShareIds(['share-1'])],
  ['inspector preferences', () => saveInspectorSelection({ grantCode: 'example-grant' })]
])('saving %s writes an owner-only, versioned file, even when it already exists', (_, save) => {
  vi.mocked(fs.readFileSync).mockReturnValue('{}')
  save()
  expect(fs.writeFileSync).toHaveBeenCalledWith(STATE_FILE, expect.any(String), { mode: 0o600 })
  expect(fs.chmodSync).toHaveBeenCalledWith(STATE_FILE, 0o600)
  expect(written().version).toBe(STATE_VERSION)
})

test('saving Tailscale share IDs merges a de-duplicated list into the saved state', () => {
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ addons: ['tailscale'] }))
  saveTailscaleShareIds(['share-1', 'share-1', 'share-2'])
  expect(written()).toMatchObject({ addons: ['tailscale'], tailscaleShareIds: ['share-1', 'share-2'] })
})

test('a failed write is non-fatal', () => {
  vi.mocked(fs.readFileSync).mockReturnValue('{}')
  vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
    throw new Error('EACCES')
  })
  expect(() => saveState([], null)).not.toThrow()
  expect(fs.writeFileSync).toHaveBeenCalled()
})

test('loading with nothing saved returns null', () => {
  vi.mocked(fs.existsSync).mockReturnValue(false)
  expect(loadState()).toBeNull()
})

test.each([['not json'], ['[]'], ['null'], ['"text"']])(
  "loading a file that isn't a JSON object (%s) returns null",
  (contents) => {
    vi.mocked(fs.readFileSync).mockReturnValue(contents)
    expect(loadState()).toBeNull()
  }
)

test('loading fills missing keys and drops ill-typed ones', () => {
  vi.mocked(fs.readFileSync).mockReturnValue(
    JSON.stringify({
      addons: 'gas',
      scale: '2',
      localServices: [1],
      tailscaleShareIds: 'share-1',
      stateInspector: ['example-grant'],
      localFormDefs: 'yes'
    })
  )
  expect(loadState()).toEqual({ addons: [], scale: null, localServices: [], localFormDefSelections: [] })
})

test('loading keeps valid, legacy and unknown keys', () => {
  const saved = {
    addons: ['gas'],
    scale: 2,
    localServices: ['fg-gas-backend'],
    localFormDefSelections: [],
    tailscaleShareIds: ['share-1'],
    stateInspector: { grantCode: 'example-grant' },
    localFormDefs: true,
    fromNewerGt: 'kept'
  }
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(saved))
  expect(loadState()).toEqual(saved)
})

test('loading a legacy localFormDefs file leaves selections unset so they can be migrated', () => {
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ localFormDefs: true }))
  const state = loadState()
  expect(state).toEqual({ addons: [], scale: null, localServices: [], localFormDefs: true })
  expect(state).not.toHaveProperty('localFormDefSelections')
})
