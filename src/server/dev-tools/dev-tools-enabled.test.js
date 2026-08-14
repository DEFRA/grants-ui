// @ts-nocheck
import { vi } from 'vitest'
import { isDevToolsEnabled } from './dev-tools-enabled.js'
import { config } from '~/src/config/config.js'

vi.mock('~/src/config/config.js', () => ({ config: { get: vi.fn() } }))

describe('isDevToolsEnabled', () => {
  const originalEnv = { NODE_ENV: process.env.NODE_ENV, ENVIRONMENT: process.env.ENVIRONMENT }

  beforeEach(() => {
    vi.clearAllMocks()
    config.get.mockReturnValue(true)
    process.env.NODE_ENV = 'development'
    process.env.ENVIRONMENT = 'local'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV
    process.env.ENVIRONMENT = originalEnv.ENVIRONMENT
  })

  it('is true only when the config flag and both environment checks agree', () => {
    expect(isDevToolsEnabled()).toBe(true)
    expect(config.get).toHaveBeenCalledWith('devTools.enabled')
  })

  it.each([
    ['the config flag is off', () => config.get.mockReturnValue(false)],
    ['the config flag is not strictly true', () => config.get.mockReturnValue('yes')],
    ['NODE_ENV is production', () => (process.env.NODE_ENV = 'production')],
    ['ENVIRONMENT is not local', () => (process.env.ENVIRONMENT = 'dev')],
    ['ENVIRONMENT is unset', () => delete process.env.ENVIRONMENT]
  ])('is false when %s', (_name, arrange) => {
    arrange()

    expect(isDevToolsEnabled()).toBe(false)
  })
})
