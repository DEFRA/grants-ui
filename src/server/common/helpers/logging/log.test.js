import { log, logger, LogCodes } from './log.js'

// Mock the logger
jest.mock('./logger.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  })
}))

describe('Logger Functionality', () => {
  const mockLogCode = {
    level: 'info',
    messageFunc: (messageOptions) => `Mock log. ${messageOptions.mock}`
  }
  const messageOptions = { mock: 'test' }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should call the info logger with the correct interpolated message', () => {
    log(mockLogCode, messageOptions)

    expect(logger.info).toHaveBeenCalledWith('Mock log. test')
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.debug).not.toHaveBeenCalled()
  })

  it('should call the error logger with the correct interpolated message', () => {
    mockLogCode.level = 'error'
    log(mockLogCode, messageOptions)

    expect(logger.error).toHaveBeenCalledWith('Mock log. test')
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.debug).not.toHaveBeenCalled()
  })

  it('should call the debug logger with the correct interpolated message', () => {
    mockLogCode.level = 'debug'
    log(mockLogCode, messageOptions)

    expect(logger.debug).toHaveBeenCalledWith('Mock log. test')
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

    expect(logger.info).toHaveBeenCalledWith('Complex log first with second values')
  })

  it('should work with real LogCodes', () => {
    const testOptions = {
      userId: 'test-user',
      organisationId: 'test-org'
    }

    log(LogCodes.AUTH.SIGN_IN_SUCCESS, testOptions)

    expect(logger.info).toHaveBeenCalledWith('User sign-in successful for user=test-user, organisation=test-org')
  })

  it('should work with error log codes', () => {
    const errorOptions = {
      error: 'Test error message'
    }

    log(LogCodes.SYSTEM.SERVER_ERROR, errorOptions)

    expect(logger.error).toHaveBeenCalledWith('Server error occurred: Test error message')
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

    expect(logger.info).toHaveBeenCalledWith('Form loaded: declaration for user=test-user')
  })

  it('should work with SUBMISSION log codes', () => {
    const submissionOptions = {
      grantType: 'adding-value',
      userId: 'test-user'
    }

    log(LogCodes.SUBMISSION.SUBMISSION_STARTED, submissionOptions)

    expect(logger.info).toHaveBeenCalledWith('Grant submission started for grantType=adding-value, user=test-user')
  })
})
