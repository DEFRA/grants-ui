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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('single error scenarios', () => {
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

  describe('chaining errors', () => {
    it('should store previous errors when from method is called', () => {
      const error1 = new BaseError('First error', 500, 'Source1', 'Reason1')
      const error2 = new BaseError('Second error', 500, 'Source2', 'Reason2')

      error2.from(error1)

      expect(error2.lastError).toBe(error1)
    })

    it('should chain errors allowing navigation from error to error bidirectionally', () => {
      const error1 = new BaseError('First error', 500, 'Source1', 'Reason1')
      const error2 = new BaseError('Second error', 500, 'Source2', 'Reason2')
      const error3 = new BaseError('Third error', 500, 'Source3', 'Reason3')

      error2.from(error1)
      error3.from(error2)

      expect(error1.nextError).toBe(error2)
      expect(error2.nextError).toBe(error3)
    })

    it('should chain non BaseError instances without creating circular references', () => {
      const error1 = new BaseError('First error', 500, 'Source1', 'Reason1')
      const standardError = new Error('Standard error')

      error1.from(standardError)

      expect(error1.lastError).toBe(standardError)
      expect(error1.nextError).toBeNull()
    })

    it('should log all chained errors when log method is called', () => {
      const error1 = new BaseError('First error', 500, 'Source1', 'Reason1')
      const error2 = new BaseError('Second error', 500, 'Source2', 'Reason2')
      const error3 = new BaseError('Third error', 500, 'Source3', 'Reason3')

      error2.from(error1)
      error3.from(error2)

      const requestMock = { id: 'req123' }
      error3.log(requestMock)

      expect(logger).toHaveBeenCalledTimes(3)
      expect(logger).toHaveBeenNthCalledWith(
        1,
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorName: 'BaseError',
          message: 'Third error',
          status: 500,
          source: 'Source3',
          reason: 'Reason3'
        },
        requestMock
      )
      expect(logger).toHaveBeenNthCalledWith(
        2,
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorName: 'BaseError',
          message: 'Second error',
          status: 500,
          source: 'Source2',
          reason: 'Reason2',
          isChainedError: true
        },
        requestMock
      )
      expect(logger).toHaveBeenNthCalledWith(
        3,
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorName: 'BaseError',
          message: 'First error',
          status: 500,
          source: 'Source1',
          reason: 'Reason1',
          isChainedError: true
        },
        requestMock
      )
    })

    it('should log all chained errors and terminate correctly when a non BaseError is in the chain', () => {
      const standardError = new Error('Standard error')
      const error1 = new BaseError('First error', 500, 'Source3', 'Reason3')

      error1.from(standardError)

      const requestMock = { id: 'req123' }
      error1.log(requestMock)

      expect(logger).toHaveBeenCalledTimes(2)
      expect(logger).toHaveBeenNthCalledWith(
        1,
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorName: 'BaseError',
          message: 'First error',
          status: 500,
          source: 'Source3',
          reason: 'Reason3'
        },
        requestMock
      )
      expect(logger).toHaveBeenNthCalledWith(
        2,
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorName: 'Error',
          message: 'Standard error',
          isChainedError: true
        },
        requestMock
      )
    })
  })
})
