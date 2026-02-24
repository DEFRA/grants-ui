import { vi } from 'vitest'
import { log, logger, LogCodes, debug } from './log.js'

vi.unmock('~/src/server/common/helpers/logging/log.js')

vi.spyOn(logger, 'info')
vi.spyOn(logger, 'debug')
vi.spyOn(logger, 'error')

describe('Logger Functionality', () => {
  const mockLogCode = {
    level: 'info',
    messageFunc: (messageOptions) => `Mock log. ${messageOptions.mock}`
  }
  const messageOptions = { mock: 'test' }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call the info logger with the correct interpolated message', () => {
    log(mockLogCode, messageOptions)

    expect(logger.info).toHaveBeenCalledWith({}, 'Mock log. test')
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.debug).not.toHaveBeenCalled()
  })

  it('should call the error logger with the correct interpolated message', () => {
    mockLogCode.level = 'error'
    log(mockLogCode, messageOptions)

    expect(logger.error).toHaveBeenCalledWith({}, 'Mock log. test')
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.debug).not.toHaveBeenCalled()
  })

  it('should call the debug logger with the correct interpolated message', () => {
    mockLogCode.level = 'debug'
    log(mockLogCode, messageOptions)

    expect(logger.debug).toHaveBeenCalledWith({}, 'Mock log. test')
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should call the logger with multiple interpolated values', () => {
    const complexLogCode = {
      level: 'info',
      messageFunc: (options) => `Complex log ${options.value1} with ${options.value2} values`
    }
    const complexOptions = { value1: 'first', value2: 'second' }

    log(complexLogCode, complexOptions)

    expect(logger.info).toHaveBeenCalledWith({}, 'Complex log first with second values')
  })

  it('should work with real LogCodes', () => {
    const testOptions = {
      userId: 'test-user',
      organisationId: 'test-org'
    }

    log(LogCodes.AUTH.SIGN_IN_SUCCESS, testOptions)

    expect(logger.info).toHaveBeenCalledWith({}, 'User sign-in successful for user=test-user, organisation=test-org')
  })

  it('should work with error log codes', () => {
    const errorOptions = {
      errorMessage: 'Test error message'
    }

    log(LogCodes.SYSTEM.SERVER_ERROR, errorOptions)

    expect(logger.error).toHaveBeenCalledWith({}, 'Server error occurred: Test error message')
  })

  it('should export the logger instance', () => {
    expect(logger).toBeDefined()
    expect(logger.info).toBeDefined()
    expect(logger.debug).toBeDefined()
    expect(logger.error).toBeDefined()
  })

  it('should export LogCodes', () => {
    expect(LogCodes).toBeDefined()
    expect(LogCodes.AUTH).toBeDefined()
    expect(LogCodes.FORMS).toBeDefined()
    expect(LogCodes.SYSTEM).toBeDefined()
  })

  it('should work with FORMS log codes', () => {
    const formOptions = {
      formName: 'declaration',
      userId: 'test-user'
    }

    log(LogCodes.FORMS.FORM_LOAD, formOptions)

    expect(logger.info).toHaveBeenCalledWith({}, 'Form loaded: declaration for user=test-user')
  })

  it('should work with SUBMISSION log codes', () => {
    const submissionOptions = {
      grantType: 'example-grant-with-auth',
      referenceNumber: 'REF-123'
    }

    log(LogCodes.SUBMISSION.SUBMISSION_SUCCESS, submissionOptions)

    expect(logger.info).toHaveBeenCalledWith(
      {},
      'Grant submission successful for grantType=example-grant-with-auth, referenceNumber=REF-123'
    )
  })

  it('should pass error objects to the logger when provided', () => {
    const testError = new Error('Test error')
    const errorLogCode = {
      level: 'error',
      messageFunc: () => 'An error occurred',
      error: testError
    }

    log(errorLogCode, {})

    expect(logger.error).toHaveBeenCalledWith({ err: testError }, 'An error occurred')
  })

  it('should not pass error context when error is not provided', () => {
    const logCodeWithoutError = {
      level: 'info',
      messageFunc: () => 'Info message'
    }

    log(logCodeWithoutError, {})

    expect(logger.info).toHaveBeenCalledWith({}, 'Info message')
  })

  it('should bypass logcodes defined level when using the dedicated debug logger', () => {
    const logCode = LogCodes.AUTH.GENERIC_ERROR
    debug(logCode, {
      userId: '123',
      error: undefined
    })
    expect(logger.debug).toHaveBeenCalledWith({}, 'Authentication error for user=123: undefined')
  })
})
