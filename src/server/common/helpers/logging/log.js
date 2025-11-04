import { LogCodes } from './log-codes.js'
import { pino } from 'pino'
import { loggerOptions } from '~/src/server/common/helpers/logging/logger-options.js'

const logger = pino(loggerOptions)

/**
 * @typedef {'info' | 'debug' | 'error'} LogLevel
 */

/**
 * Logs an event with the specified level and context.
 * @param {object} logCode - Logging options.
 * @param {string} logCode.level - The log level.
 * @param {Function} logCode.messageFunc - A function that creates an interpolated message string
 * @param {object} messageOptions - Values for message interpolation
 * @param {object} [request] - Hapi request object (optional)
 * @throws {Error} If log parameters are invalid.
 */
const log = (logCode, messageOptions, request) => {
  getLoggerOfType(logCode.level, request)(logCode.messageFunc(messageOptions))
}

/**
 * Returns the logger function corresponding to the given log level.
 * @param {string} level - The log level.
 * @param {object} [request] - Hapi request object (optional)
 * @returns {(message: string) => void} Logger function.
 */
const getLoggerOfType = (level, request) => {
  const requestLogger = request && request.log

  return {
    info: (message) => (requestLogger ? request.log(['info'], message) : logger.info(message)),
    debug: (message) => (requestLogger ? request.log(['debug'], message) : logger.debug(message)),
    error: (message) => (requestLogger ? request.log(['error'], message) : logger.error(message))
  }[level]
}

export { log, logger, LogCodes }
