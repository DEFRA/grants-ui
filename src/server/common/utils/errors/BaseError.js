/**
 * @typedef {typeof import('../../constants/status-codes.js').statusCodes} StatusCodes
 * @typedef {(StatusCodes)[keyof StatusCodes]} StatusCode
 * @typedef {import('../../helpers/logging/log-codes-definition.js').LogCodesDefinition} LogDefinition
 *
 */

/**
 * BaseError profile schema.
 * @typedef {{
 *   message: string,
 *   source: string,
 *   reason: string,
 *   status?: StatusCode,
 *   [key: string]: any
 * }} BaseErrorArgs
 */

import { LogCodes } from '../../helpers/logging/log-codes.js'
import { log as logger } from '../../helpers/logging/log.js'

/**
 * @abstract
 */
export class BaseError extends Error {
  /**
   * The log code to use when logging this error
   * @abstract
   * @protected
   */
  logCode = LogCodes.SYSTEM.SERVER_ERROR

  /**
   * Additional details used for logging
   * @type {Object}
   * @private
   */
  _details = {
    errorName: this.name
  }

  /**
   * The previous error in the chain
   * @type {BaseError|Error}
   */
  previousError

  /**
   * The next error in the chain
   * @type {BaseError|Error}
   */
  nextError

  /**
   * Map of error details to mutate
   * @type {Object}
   * @protected
   */
  detailsMap = {
    message: 'errorMessage',
    name: 'errorName'
  }

  /**
   * @param {BaseErrorArgs} properties
   */
  constructor(properties) {
    super(properties.message)
    this.details = properties
  }

  /**
   * Sends error details to the logger
   * @param {import('@hapi/hapi').Request|null} request
   * @param {...Record<string, any>} additionalDetail
   */
  log(request = null, ...additionalDetail) {
    const messageOptions = Object.assign({}, this._details, ...additionalDetail)

    logger(this.logCode, messageOptions, request)

    const lastError = this.previousError

    if (lastError instanceof BaseError) {
      lastError.log(request, { isChainedError: true })
    } else if (lastError instanceof Error) {
      logger(
        LogCodes.SYSTEM.GENERIC_ERROR,
        {
          errorName: lastError.name,
          errorMessage: lastError.message,
          isChainedError: true
        },
        request
      )
    } else if (lastError !== undefined && lastError !== null) {
      logger(
        LogCodes.SYSTEM.GENERIC_ERROR,
        {
          errorName: 'UnknownError',
          errorMessage: 'An unknown error was chained but it is not an instance of Error',
          isChainedError: true
        },
        request
      )
    }
  }

  /**
   * Chain this error from another error, indicating that the previous error led to this error
   * @param {BaseError|Error} error - The error to chain from
   * @returns {void} - Returns this for method chaining
   */
  from(error) {
    this.previousError = error
    if (error instanceof BaseError && error.nextError !== this) {
      error.chain(this)
    }
  }

  /**
   * Chain another error to this error, indicating that this error led to the next error
   * @param {BaseError|Error} error
   */
  chain(error) {
    this.nextError = error
    if (error instanceof BaseError && error.previousError !== this) {
      error.from(this)
    }
  }

  /**
   * The name of the error class
   * @returns {string}
   */
  get name() {
    return this.constructor.name
  }

  /**
   * Set additional details for this error, which can be used when logging the error
   * @param {Object} details
   */
  set details(details) {
    const detailsClone = structuredClone(details)
    for (const key in detailsClone) {
      if (this.detailsMap[key]) {
        detailsClone[this.detailsMap[key]] = detailsClone[key]
        delete detailsClone[key]
      }
    }
    this._details = { ...this._details, ...detailsClone }
  }

  /**
   *
   * @returns {Object}
   */
  get details() {
    return this._details
  }
}
