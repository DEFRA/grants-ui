import { describe, expect, it, vi } from 'vitest'
import { BaseError } from './BaseError'
import { statusCodes } from '../../constants/status-codes.js'
import { LogCodes } from '../../helpers/logging/log-codes.js'
import { log as logger } from '../../helpers/logging/log.js'

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

describe('BaseError', () => {
  it('should set properties correctly in the constructor', () => {
    const message = 'Test message'
    const statusCode = statusCodes.internalServerError
    const source = 'TestSource'
    const reason = 'TestReason'

    const error = new BaseError(message, statusCode, source, reason)

    expect(error.message).toBe(message)
    expect(error.status).toBe(statusCode)
    expect(error.source).toBe(source)
    expect(error.reason).toBe(reason)
  })

  it('should return the correct name of the error class', () => {
    const error = new BaseError('Test', 500, 'TestSource', 'TestReason')
    expect(error.name).toBe('BaseError')
  })

  it('should return the correct name of an extended class', () => {
    class TestErrorExtension extends BaseError {}
    const error = new TestErrorExtension('Test', 500, 'TestSource', 'TestReason')
    expect(error.name).toBe('TestErrorExtension')
  })

  it('should maintain the correct type when extended', () => {
    class TestErrorExtension extends BaseError {}
    const error = new TestErrorExtension('Test', 500, 'TestSource', 'TestReason')
    expect(error).toBeInstanceOf(BaseError)
    expect(error).toBeInstanceOf(TestErrorExtension)
  })

  it('should set and get the log code correctly', () => {
    const error = new BaseError('Test', 500, 'TestSource', 'TestReason')

    const newLogCode = 'NEW_LOG_CODE'
    error.logCode = newLogCode

    expect(error.logCode).toBe(newLogCode)
  })

  it('should call logger with correct parameters when log method is invoked', () => {
    const message = 'Test message'
    const statusCode = 500
    const source = 'TestSource'
    const reason = 'TestReason'
    const requestMock = { id: 'req123' }
    const additionalDetails = { detailKey: 'detailValue' }

    const error = new BaseError(message, statusCode, source, reason)
    error.log(requestMock, additionalDetails)

    expect(logger).toHaveBeenCalledWith(
      LogCodes.SYSTEM.SERVER_ERROR,
      {
        errorName: 'BaseError',
        message,
        status: statusCode,
        source,
        reason,
        ...additionalDetails
      },
      requestMock
    )
  })

  it('should use default log code if not overridden', () => {
    const error = new BaseError('Test', 500, 'TestSource', 'TestReason')
    expect(error.logCode).toBe(LogCodes.SYSTEM.SERVER_ERROR)
  })
})
