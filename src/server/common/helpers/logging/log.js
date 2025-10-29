import { createLogger } from './logger.js'

const logger = createLogger()

/**
 * @typedef {'info' | 'debug' | 'error'} LogLevel
 */

/**
 * Logs an event with the specified level and context.
 * @param {object} logCode - Logging options.
 * @param {string} logCode.level - The log level.
 * @param {Function} logCode.messageFunc - A function that creates an interpolated message string
 * @param {object} messageOptions - Values for message interpolation
 * @throws {Error} If log parameters are invalid.
 */
const log = (logCode, messageOptions) => {
  getLoggerOfType(logCode.level)(logCode.messageFunc(messageOptions))
}

/**
 * Returns the logger function corresponding to the given log level.
 * @param {string} level - The log level.
 * @returns {(context: object) => void} Logger function.
 */
const getLoggerOfType = (level) => {
  return {
    info: (message) => logger.info(message),
    debug: (message) => logger.debug(message),
    error: (message) => logger.error(message)
  }[level]
}

export { log, logger }
export { LogCodes } from './log-codes.js'
