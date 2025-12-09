import { isObject, isObjectEmpty } from '../../utils/objects.js'
import { logicalAnd, logicalNot } from '~/src/server/common/utils/functional.js'

const LogLevel = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  DEBUG: 'debug'
}

const objectNotEmpty = logicalNot(isObjectEmpty)
const isStrictObject = logicalAnd(isObject, objectNotEmpty)

Object.freeze(LogLevel)

/**
 * Validates a logCode object to ensure it meets the required structure and criteria.
 *
 * The function checks the following:
 * - The `logCode` parameter must be a non-empty object.
 * - The `logCode` object must contain a `level` property, which should be one of:
 *   - `info`
 *   - `debug`
 *   - `warn`
 *   - `error`
 * - The `logCode` object must contain a `messageFunc` property, which must be a function.
 *
 * @param {Object} logCode - The log code object to validate.
 * @throws {Error} Throws an error if `logCode` is not a non-empty object.
 * @throws {Error} Throws an error if `logCode.level` is not one of the specified valid levels.
 * @throws {Error} Throws an error if `logCode.messageFunc` is not a function.
 */
export const validateLogCode = (logCode) => {
  if (!isStrictObject(logCode)) {
    throw new Error('logCode must be a non-empty object')
  }

  if (!['info', 'debug', 'warn', 'error'].includes(logCode.level)) {
    throw new Error('Invalid log level')
  }

  if (typeof logCode.messageFunc !== 'function') {
    throw new Error('logCode.messageFunc must be a function')
  }
}
