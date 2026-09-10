// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { cmdAllTests } from './tests.js'

afterEach(() => vi.restoreAllMocks())

test('all tests runs every suite and reports all failures while preserving the first exit code', () => {
  const runTest = vi.fn().mockReturnValueOnce(7).mockReturnValueOnce(0).mockReturnValueOnce(2)
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  expect(cmdAllTests(false, runTest)).toBe(7)
  expect(runTest.mock.calls).toEqual([
    ['unit', false],
    ['contracts', false],
    ['acceptance', false]
  ])
  expect(log).toHaveBeenCalledWith('  unit: failed (exit 7)')
  expect(log).toHaveBeenCalledWith('  contracts: passed')
  expect(log).toHaveBeenCalledWith('  acceptance: failed (exit 2)')
})

test('all tests passes when every suite succeeds, forwarding dry-run to every suite', () => {
  const runTest = vi.fn().mockReturnValue(0)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  expect(cmdAllTests(true, runTest)).toBe(0)
  expect(runTest.mock.calls).toEqual([
    ['unit', true],
    ['contracts', true],
    ['acceptance', true]
  ])
})
