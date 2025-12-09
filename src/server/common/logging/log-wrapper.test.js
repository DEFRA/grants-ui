import { vi } from 'vitest'
import * as wrapper from './log-wrapper.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'

const mockedLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn()
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => {
  return {
    logger: mockedLogger,
    LogCodes: {},
    log: vi.fn()
  }
})

describe('log-wrapper', () => {
  it('logs an Error with ECS structure', () => {
    const err = new Error('boom')

    wrapper.logError(err)

    const call = logger.error.mock.calls[0][0]
    expect(call.error.type).toBe('Error')
    expect(call.error.message).toBe('boom')
  })

  it('converts string to synthetic error', () => {
    wrapper.logError('fail')

    const call = logger.error.mock.calls[1][0]
    expect(call.error.type).toBe('Error')
    expect(call.error.message).toBe('fail')
  })

  it('allows metadata', () => {
    wrapper.logError('oops', undefined, { userId: 123 })

    const call = logger.error.mock.calls[2][0]
    expect(call.userId).toBe(123)
  })

  it('logs a warning similarly', () => {
    wrapper.logWarn('warn!')

    const call = logger.warn.mock.calls[0][0]
    expect(call.error.message).toBe('warn!')
  })

  it('logs info without error object', () => {
    wrapper.logInfo('hello', { a: 1 })

    const call = logger.info.mock.calls[0]
    expect(call[0].a).toBe(1)
    expect(call[1]).toBe('hello')
  })
})
