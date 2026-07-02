import { vi } from 'vitest'
import { log, logger, LogCodes, debug, error } from './log.js'

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

  it.each([
    ['info', 'info'],
    ['error', 'error'],
    ['debug', 'debug']
  ])('routes a %s-level code to logger.%s only with the interpolated message', (level, method) => {
    log({ ...mockLogCode, level }, messageOptions)

    expect(logger[method]).toHaveBeenCalledWith({}, 'Mock log. test')
    for (const other of ['info', 'error', 'debug'].filter((m) => m !== method)) {
      expect(logger[other]).not.toHaveBeenCalled()
    }
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
      currentRelationshipId: 'test-org'
    }

    log(LogCodes.AUTH.SIGN_IN_SUCCESS, testOptions)

    expect(logger.info).toHaveBeenCalledWith({}, 'User sign-in successful for user=test-user, relationshipId=test-org')
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

  it('should always log at error level when using the dedicated error logger', () => {
    const logCode = LogCodes.AUTH.SIGN_IN_SUCCESS
    error(logCode, { userId: '123', currentRelationshipId: 'org-456' })

    expect(logger.error).toHaveBeenCalledWith({}, 'User sign-in successful for user=123, relationshipId=org-456')
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.debug).not.toHaveBeenCalled()
  })

  it('should pass error objects to the logger when using the dedicated error logger', () => {
    const testError = new Error('Test error')
    const logCode = { level: 'info', messageFunc: () => 'An error occurred', error: testError }
    error(logCode, {})

    expect(logger.error).toHaveBeenCalledWith({ err: testError }, 'An error occurred')
  })

  it('should pass error objects to the logger when using the dedicated debug logger', () => {
    const testError = new Error('Test error')
    const logCode = { level: 'info', messageFunc: () => 'A debug error', error: testError }
    debug(logCode, {})

    expect(logger.debug).toHaveBeenCalledWith({ err: testError }, 'A debug error')
  })
})
