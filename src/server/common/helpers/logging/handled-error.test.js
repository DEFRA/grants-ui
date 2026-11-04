import { vi } from 'vitest'
import { logHandledError } from './handled-error.js'
import { LogCodes } from './log.js'
import { BaseError } from '~/src/server/common/utils/errors/BaseError.js'
import { ConsolidatedViewError } from '~/src/server/common/utils/errors/ConsolidatedViewError.js'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'

vi.unmock('~/src/server/common/helpers/logging/log.js')

describe('logHandledError', () => {
  let request
  const fallbackCode = LogCodes.SYSTEM.EXTERNAL_API_ERROR
  const fallbackDetails = { endpoint: 'fetch details', service: 'consolidated-view' }

  beforeEach(() => {
    request = { logger: mockRequestLogger() }
  })

  it('preserves the structured error policy, upstream details and cause chain without a fallback log', () => {
    const cause = BaseError.wrap(new Error('Connection failed'))
    const error = new ConsolidatedViewError({
      message: 'Business lookup failed',
      source: 'makeConsolidatedViewRequest',
      reason: 'api_error',
      status: 502,
      statusCode: 503,
      responseBody: 'Service unavailable',
      sbi: 'test-sbi'
    }).from(cause)
    const details = structuredClone(error.details)

    logHandledError(error, request, { fallbackCode, fallbackDetails })

    expect(request.logger.error.mock.calls).toEqual([
      [{}, error.logCode.messageFunc(error.details)],
      [{}, cause.logCode.messageFunc(cause.details)]
    ])
    expect(request.logger.error.mock.calls[0][1]).toContain('status=503')
    expect(request.logger.error.mock.calls[0][1]).toContain('responseBody=Service unavailable')
    expect(error.details).toEqual(details)
    expect([...error.causeErrors]).toEqual([cause])
    expect(request.logger.debug).not.toHaveBeenCalled()
  })

  it('logs an ordinary error once at the fallback level, preserving the original error and context', () => {
    const error = new Error('Lookup failed')
    const options = Object.freeze({
      fallbackCode: Object.freeze({ ...fallbackCode }),
      fallbackDetails: Object.freeze({ ...fallbackDetails, upstreamStatus: 503 })
    })

    logHandledError(error, request, options)

    expect(request.logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: error },
      'External API error for fetch details | service=consolidated-view | upstreamStatus=503: Lookup failed'
    )
    expect(request.logger.debug).not.toHaveBeenCalled()
    expect(options.fallbackCode).not.toHaveProperty('error')
    expect(options.fallbackDetails).not.toHaveProperty('errorMessage')
  })

  it('honours a warning fallback code and allows omitted fallback details', () => {
    logHandledError('Lookup failed', request, { fallbackCode: LogCodes.SYSTEM.ROUTING_DEFINITION_FALLBACK })

    expect(request.logger.warn).toHaveBeenCalledExactlyOnceWith(
      {},
      LogCodes.SYSTEM.ROUTING_DEFINITION_FALLBACK.messageFunc({ errorMessage: 'Lookup failed' })
    )
    expect(request.logger.error).not.toHaveBeenCalled()
  })

  it.each([
    ['a string', 'Lookup failed', 'Lookup failed'],
    ['an empty string', '', 'An unknown error occurred'],
    ['null', null, 'An unknown error occurred'],
    ['undefined', undefined, 'An unknown error occurred'],
    ['a number', 42, 'An unknown error occurred'],
    ['an object', { privateData: 'do not log' }, 'An unknown error occurred'],
    ['an error with an empty message', new Error(), 'An unknown error occurred']
  ])('safely logs %s', (_description, error, errorMessage) => {
    logHandledError(error, request, { fallbackCode, fallbackDetails })

    expect(request.logger.error).toHaveBeenCalledExactlyOnceWith(
      error instanceof Error ? { err: error } : {},
      fallbackCode.messageFunc({ ...fallbackDetails, errorMessage })
    )
  })
})
