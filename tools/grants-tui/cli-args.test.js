// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { validateArgs } from './cli-args.js'

afterEach(() => vi.restoreAllMocks())

test.each([
  ['up', '--tailscale'],
  ['tailscale', 'on'],
  ['tailscale', 'off', '--dry-run']
])('accepts %j', (...args) => {
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('exit')
  })
  validateArgs(args)
  expect(exit).not.toHaveBeenCalled()
})

test.each([['tailscale'], ['tailscale', 'invalid']])('rejects incomplete or invalid mode: %j', (...args) => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('exit')
  })
  expect(() => validateArgs(args)).toThrow('exit')
  expect(exit).toHaveBeenCalledWith(1)
})
