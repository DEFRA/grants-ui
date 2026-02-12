import { describe, expect, it, vi } from 'vitest'
import { BaseError, GenericError } from './BaseError'
import { LogCodes } from '../../helpers/logging/log-codes.js'
import { log as logger } from '../../helpers/logging/log.js'

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

describe('TestError', () => {
  class TestError extends BaseError {}

  const message = 'Test message'
  const source = 'TestSource'
  const reason = 'TestReason'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('single error scenarios', () => {
    it('should set properties correctly in the constructor (including mutators)', () => {
      const error = new TestError({ message, source, reason })
      expect(error.details.errorMessage).toBe(message)
      expect(error.details.source).toBe(source)
      expect(error.details.reason).toBe(reason)
    })

    it('should return the correct name of the error class', () => {
      const error = new TestError({ message, source, reason })
      expect(error.name).toBe('TestError')
    })

    it('should return the correct name of an extended class', () => {
      class TestErrorExtension extends TestError {}

      const error = new TestErrorExtension({ message, source, reason })
      expect(error.name).toBe('TestErrorExtension')
    })

    it('should maintain the correct type when extended', () => {
      class TestErrorExtension extends TestError {}

      const error = new TestErrorExtension({ message, source, reason })
      expect(error).toBeInstanceOf(TestError)
      expect(error).toBeInstanceOf(TestErrorExtension)
    })

    it('should set and get the log code correctly', () => {
      const error = new TestError({ message, source, reason })

      const newLogCode = 'NEW_LOG_CODE'
      error.logCode = newLogCode

      expect(error.logCode).toBe(newLogCode)
    })

    it('should set and log additional details correctly', () => {
      const error = new TestError({ message, source, reason, status: 500 })
      error.details = { detailKey: 'detailValue' }

      const requestMock = { id: 'req123' }
      error.log(requestMock)

      expect(logger).toHaveBeenCalledWith(
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorName: 'TestError',
          errorMessage: message,
          status: 500,
          source: 'TestSource',
          reason: 'TestReason',
          detailKey: 'detailValue'
        },
        requestMock
      )
    })

    it('should call logger with correct parameters when log method is invoked', () => {
      const requestMock = { id: 'req123' }
      const additionalDetails = { detailKey: 'detailValue' }

      const error = new TestError({ message, source, reason })
      error.log(requestMock, additionalDetails)

      expect(logger).toHaveBeenCalledWith(
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorName: 'TestError',
          errorMessage: message,
          source,
          reason,
          ...additionalDetails
        },
        requestMock
      )
    })

    it('should use default log code if not overridden', () => {
      const error = new TestError({ message, source, reason })
      expect(error.logCode).toBe(LogCodes.SYSTEM.SERVER_ERROR)
    })
  })

  describe('chaining errors', () => {
    it('should store previous errors when from method is called', () => {
      const error1 = new TestError({ message: 'First error', source: 'Source1', reason: 'Reason1' })
      const error2 = new TestError({ message: 'Second error', status: 500, source: 'Source2', reason: 'Reason2' })

      error2.from(error1)

      expect(error2.causeErrors.has(error1)).toBe(true)
    })

    it('should chain errors allowing navigation from error to error bidirectionally', () => {
      const error1 = new TestError({ message: 'First error', status: 500, source: 'Source1', reason: 'Reason1' })
      const error2 = new TestError({ message: 'Second error', status: 500, source: 'Source2', reason: 'Reason2' })
      const error3 = new TestError({ message: 'Third error', status: 500, source: 'Source3', reason: 'Reason3' })

      error2.from(error1)
      error3.from(error2)

      expect(error1.effectErrors.has(error2)).toBe(true)
      expect(error2.effectErrors.has(error3)).toBe(true)
    })

    it('should chain non TestError instances without creating circular references', () => {
      const error1 = new TestError({ message: 'First error', status: 500, source: 'Source1', reason: 'Reason1' })
      const standardError = new Error('Standard error')

      error1.from(standardError)

      expect(error1.causeErrors.size).toBe(1)
      expect(error1.effectErrors.size).toBe(0)
    })

    it('should wrap non TestError (BaseError) instances in a GenericError when chaining', () => {
      const error1 = new TestError({ message: 'First error', status: 500, source: 'Source1', reason: 'Reason1' })
      const error2 = new Error('Standard error')

      error1.from(error2)

      const causeError = Array.from(error1.causeErrors).pop()

      expect(causeError.details.originalError).toStrictEqual(error2)
      expect(causeError).toBeInstanceOf(GenericError)
    })

    it('should not allow circular references when chaining errors', () => {
      const error1 = new TestError({ message: 'First error', status: 500, source: 'Source1', reason: 'Reason1' })
      const error2 = new TestError({ message: 'Second error', status: 500, source: 'Source2', reason: 'Reason2' })

      error1.from(error2)
      expect(() => error2.from(error1)).toThrow('Circular error reference detected in error chain')
    })

    it('should log all chained errors when log method is called', () => {
      const error1 = new TestError({ message: 'First error', status: 500, source: 'Source1', reason: 'Reason1' })
      const error2 = new TestError({ message: 'Second error', status: 500, source: 'Source2', reason: 'Reason2' })
      const error3 = new TestError({ message: 'Third error', status: 500, source: 'Source3', reason: 'Reason3' })

      error2.from(error1)
      error3.from(error2)

      const requestMock = { id: 'req123' }
      error3.log(requestMock)

      expect(logger).toHaveBeenCalledTimes(3)
      expect(logger).toHaveBeenNthCalledWith(
        1,
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorName: 'TestError',
          errorMessage: 'Third error',
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
          errorName: 'TestError',
          errorMessage: 'Second error',
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
          errorName: 'TestError',
          errorMessage: 'First error',
          status: 500,
          source: 'Source1',
          reason: 'Reason1',
          isChainedError: true
        },
        requestMock
      )
    })

    it('should log all chained errors and terminate correctly when a non TestError is in the chain', () => {
      const standardError = new Error('Standard error')
      const error1 = new TestError({ message: 'First error', status: 500, source: 'Source3', reason: 'Reason3' })

      error1.from(standardError)

      const requestMock = { id: 'req123' }
      error1.log(requestMock)

      expect(logger).toHaveBeenCalledTimes(2)
      expect(logger).toHaveBeenNthCalledWith(
        1,
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorName: 'TestError',
          errorMessage: 'First error',
          status: 500,
          source: 'Source3',
          reason: 'Reason3'
        },
        requestMock
      )
      expect(logger).toHaveBeenNthCalledWith(
        2,
        LogCodes.SYSTEM.GENERIC_ERROR,
        {
          errorName: 'GenericError',
          errorMessage: 'Standard error',
          isChainedError: true,
          originalError: standardError,
          reason: 'wrappedError',
          source: 'unknown'
        },
        requestMock
      )
    })
  })

  describe('findRootError', () => {
    it('should find the root error in a chain of errors', () => {
      const error1 = new TestError({ message: 'First error', status: 500, source: 'Source1', reason: 'Reason1' })
      const error2 = new TestError({ message: 'Second error', status: 500, source: 'Source2', reason: 'Reason2' })
      const error3 = new TestError({ message: 'Third error', status: 500, source: 'Source3', reason: 'Reason3' })

      error1.from(error2)
      error2.from(error3)

      expect(TestError.findRootErrors(error3)).toEqual(expect.arrayContaining([error1]))
    })

    it('should return multiple root errors if there are multiple independent chains', () => {
      const error1 = new TestError({ message: 'First error', status: 500, source: 'Source1', reason: 'Reason1' })
      const error2 = new TestError({ message: 'Second error', status: 500, source: 'Source2', reason: 'Reason2' })
      const error3 = new TestError({ message: 'Third error', status: 500, source: 'Source3', reason: 'Reason3' })

      error1.from(error2)
      error3.from(error2)

      expect(TestError.findRootErrors(error2)).toEqual(expect.arrayContaining([error1, error3]))
    })

    it('should return the error itself if it has no causes', () => {
      const error = new TestError({ message: 'Only error', status: 500, source: 'Source1', reason: 'Reason1' })
      expect(TestError.findRootErrors(error)).toEqual(expect.arrayContaining([error]))
    })
  })
})
