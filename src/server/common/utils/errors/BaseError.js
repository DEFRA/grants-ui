/**
 * @typedef {typeof import('../../constants/status-codes.js').statusCodes} StatusCodes
 * @typedef {(StatusCodes)[keyof StatusCodes]} StatusCode
 * @typedef {import('../../helpers/logging/log-codes-definition.js').LogCodesDefinition} LogDefinition
 */

import { LogCodes } from '../../helpers/logging/log-codes.js'
import { log as logger } from '../../helpers/logging/log.js'

export class BaseError extends Error {
  /**
   * The log code to use when logging this error
   * @private
   */
  _logCode = LogCodes.SYSTEM.SERVER_ERROR

  /**
   * An array to store previous errors for error chaining
   * @type {(BaseError|Error)[]}
   * @private
   */
  _previousErrors = []

  /**
   * @type {(BaseError|Error)[]}
   * @private
   */
  _nextErrors = []

  /**
   * @param {string} message
   * @param {StatusCode} statusCode
   * @param {string|undefined} source
   * @param {string} reason
   */
  constructor(message, statusCode, source, reason) {
    super(message)
    this.status = statusCode
    this.source = source
    this.reason = reason
  }

  /**
   * Sends error details to the logger
   * @param {import('@hapi/hapi').Request|null} request
   * @param {Record<string, any>[]} additionalDetail
   */
  log(request = null, ...additionalDetail) {
    const messageOptions = {
      errorName: this.name,
      message: this.message,
      status: this.status,
      source: this.source,
      reason: this.reason
    }

    logger(this._logCode, Object.assign({}, messageOptions, ...additionalDetail), request)

    /** @type {BaseError|Error} **/
    let currentError = this
    let previousError = currentError instanceof BaseError ? currentError.lastError : null

    while (previousError) {
      // Log the previous error
      if (previousError instanceof BaseError) {
        const prevOptions = {
          errorName: previousError.name,
          message: previousError.message,
          status: previousError.status,
          source: previousError.source,
          reason: previousError.reason,
          isChainedError: true
        }
        logger(previousError._logCode, Object.assign({}, prevOptions, ...additionalDetail), request)
      } else {
        logger(
          this._logCode,
          Object.assign(
            {},
            {
              errorName: previousError.name,
              message: previousError.message,
              isChainedError: true
            },
            ...additionalDetail
          ),
          request
        )
      }

      currentError = previousError
      previousError = previousError instanceof BaseError ? previousError.lastError : null
    }
  }

  /**
   * @param {BaseError|Error} error - The error to chain from
   */
  from(error) {
    this._previousErrors.push(error)
    if (error instanceof BaseError && !error._nextErrors.includes(this)) {
      error.chain(this)
    }
  }

  /**
   * Chain another error to this error, indicating that this error led to the next error
   * @param error
   */
  chain(error) {
    this._nextErrors.push(error)
    if (error instanceof BaseError && !error._previousErrors.includes(this)) {
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
   * @param {LogDefinition} logCode
   */
  set logCode(logCode) {
    this._logCode = logCode
  }

  /**
   * @returns {LogDefinition}
   */
  get logCode() {
    return this._logCode
  }

  /**
   * @returns {BaseError|Error|null}
   */
  get lastError() {
    return this._previousErrors.length > 0 ? this._previousErrors[this._previousErrors.length - 1] : null
  }

  /**
   * @returns {BaseError|Error|null}
   */
  get nextError() {
    return this._nextErrors.length > 0 ? this._nextErrors[this._nextErrors.length - 1] : null
  }
}
