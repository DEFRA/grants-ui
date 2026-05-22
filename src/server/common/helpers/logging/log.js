import { pino } from 'pino'
import { loggerOptions } from '~/src/server/common/helpers/logging/logger-options.js'

const logger = pino(loggerOptions)

/**
 * Logs an event with the specified level and context.
 * @param {LogCodeEntry} logCode - The log code entry with level, message builder and optional error.
 * @param {Record<string, unknown>} messageOptions - Values for message interpolation.
 * @param {AnyRequest} [request] - Hapi request object (optional).
 */
const log = (logCode, messageOptions, request) => {
  const message = logCode.messageFunc(messageOptions)
  const errorContext = logCode.error ? { err: logCode.error } : undefined
  getLoggerOfType(logCode.level, request)(errorContext, message)
}

/**
 * Logs an event at debug level, regardless of the logCode's level.
 * @param {LogCodeEntry} logCode - The log code entry with message builder and optional error.
 * @param {Record<string, unknown>} messageOptions - Values for message interpolation.
 * @param {AnyRequest} [request] - Hapi request object (optional).
 */
const debug = (logCode, messageOptions, request) => {
  const message = logCode.messageFunc(messageOptions)
  const err = logCode.error
  const errorContext = err ? { err } : undefined
  getLoggerOfType('debug', request)(errorContext, message)
}

/**
 * Logs an event at error level, regardless of the logCode's level.
 * @param {LogCodeEntry} logCode - The log code entry with message builder and optional error.
 * @param {Record<string, unknown>} messageOptions - Values for message interpolation.
 * @param {AnyRequest} [request] - Hapi request object (optional).
 */
const error = (logCode, messageOptions, request) => {
  const message = logCode.messageFunc(messageOptions)
  const err = logCode.error
  const errorContext = err ? { err } : undefined
  getLoggerOfType('error', request)(errorContext, message)
}

/**
 * Returns the logger function corresponding to the given log level.
 * @param {import('./log-codes/definition.js').LogTypes.LogLevel} level - The log level.
 * @param {AnyRequest} [request] - Hapi request object (optional).
 * @returns {(errorContext: object | undefined, message: string) => void} Logger function.
 */
const getLoggerOfType = (level, request) => {
  const requestLogger = /** @type {import('pino').Logger} */ (request?.logger || logger)
  return (errorContext, message) => requestLogger[level](errorContext || {}, message)
}

export { log, debug, error, logger }
export { LogCodes } from './log-codes.js'

/**
 * @typedef {LogCodesDefinition & { error?: Error }} LogCodeEntry
 *
 * @import { LogCodesDefinition } from './log-codes/definition.js'
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
