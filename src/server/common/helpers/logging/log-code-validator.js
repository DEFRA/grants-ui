import { isStrictObject } from '../../utils/isStrictObject.js'

const LogLevel = {
  INFO: 'info',
  ERROR: 'error',
  DEBUG: 'debug'
}

Object.freeze(LogLevel)

export const validateLogCode = (logCode) => {
  if (!isStrictObject(logCode, true)) {
    throw new Error('logCode must be a non-empty object')
  }

  if (!['info', 'debug', 'error'].includes(logCode.level)) {
    throw new Error('Invalid log level')
  }

  if (typeof logCode.messageFunc !== 'function') {
    throw new Error('logCode.messageFunc must be a function')
  }
}
