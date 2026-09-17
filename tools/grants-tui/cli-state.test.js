// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import * as fs from 'node:fs'
import { saveInspectorSelection, saveState } from './cli-state.js'

vi.mock('node:fs', () => ({ existsSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn() }))

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
  expect(JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0][1]))).toEqual({
    addons: ['gas'],
    scale: 2,
    localServices: ['example'],
    localFormDefSelections: ['example-grant'],
    stateInspector: selection
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
