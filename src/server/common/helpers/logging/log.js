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
 * @param {object} [logCode.error] - An error object (optional)
 * @param {object} messageOptions - Values for message interpolation
 * @param {object} [request] - Hapi request object (optional)
 * @throws {Error} If log parameters are invalid.
 */
const log = (logCode, messageOptions, request) => {
  const message = logCode.messageFunc(messageOptions)
  const errorContext = logCode.error ? { err: logCode.error } : undefined
  getLoggerOfType(logCode.level, request)(errorContext, message)
}

/**
 * Returns the logger function corresponding to the given log level.
 * @param {string} level - The log level.
 * @param {object} [request] - Hapi request object (optional)
 * @returns {(errorContext: object | undefined, message: string) => void} Logger function.
 */
const getLoggerOfType = (level, request) => {
  // hapi-pino attaches a pino logger instance to request.logger
  const pinoLogger = request?.logger || logger

  return {
    info: (errorContext, message) => pinoLogger.info(errorContext || {}, message),
    debug: (errorContext, message) => pinoLogger.debug(errorContext || {}, message),
    error: (errorContext, message) => pinoLogger.error(errorContext || {}, message)
  }[level]
}

export { log, logger, LogCodes }
