import { validateLogCode } from './log-code-validator.js'

describe('validateLogCode', () => {
  it('should pass validation for valid log code', () => {
    const validLogCode = {
      level: 'info',
      messageFunc: () => 'test message'
    }

    expect(() => validateLogCode(validLogCode)).not.toThrow()
  })

  it('should throw error for null or undefined log code', () => {
    expect(() => validateLogCode(null)).toThrow('logCode must be a non-empty object')
    expect(() => validateLogCode(undefined)).toThrow('logCode must be a non-empty object')
  })

  it('should throw error for empty object', () => {
    expect(() => validateLogCode({})).toThrow('logCode must be a non-empty object')
  })

  it('should throw error for non-object types', () => {
    expect(() => validateLogCode('string')).toThrow('logCode must be a non-empty object')
    expect(() => validateLogCode(42)).toThrow('logCode must be a non-empty object')
    expect(() => validateLogCode([])).toThrow('logCode must be a non-empty object')
  })

  it('should throw error for invalid log level', () => {
    const invalidLogCode = {
      level: 'invalid',
      messageFunc: () => 'test message'
    }

    expect(() => validateLogCode(invalidLogCode)).toThrow('Invalid log level')
  })

  it('should accept valid log levels', () => {
    const levels = ['info', 'debug', 'error']

    levels.forEach((level) => {
      const logCode = {
        level,
        messageFunc: () => 'test message'
      }
      expect(() => validateLogCode(logCode)).not.toThrow()
    })
  })

  it('should throw error for non-function messageFunc', () => {
    const invalidLogCode = {
      level: 'info',
      messageFunc: 'not a function'
    }

    expect(() => validateLogCode(invalidLogCode)).toThrow('logCode.messageFunc must be a function')
  })

  it('should throw error for missing messageFunc', () => {
    const invalidLogCode = {
      level: 'info'
    }

    expect(() => validateLogCode(invalidLogCode)).toThrow('logCode.messageFunc must be a function')
  })

  it('should throw error for missing level', () => {
    const invalidLogCode = {
      messageFunc: () => 'test message'
    }

    expect(() => validateLogCode(invalidLogCode)).toThrow('Invalid log level')
  })
})
