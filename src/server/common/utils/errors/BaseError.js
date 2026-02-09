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
   * Additional details used for logging
   * @type {Object}
   * @private
   */
  _details = {}

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

    logger(this._logCode, Object.assign({}, messageOptions, this._details, ...additionalDetail), request)

    const lastError = this.lastError

    if (lastError instanceof BaseError) {
      lastError.log(request, { isChainedError: true })
    } else if (lastError !== null) {
      logger(
        this._logCode,
        {
          errorName: lastError?.name || 'UnknownError',
          message: lastError?.message || 'No additional error information available',
          isChainedError: true
        },
        request
      )
    }
  }

  /**
   * Chain this error from another error, indicating that the previous error led to this error
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
   * Set additional details for this error, which can be used when logging the error
   * @param {Object} details
   */
  set details(details) {
    this._details = { ...this._details, ...details }
  }

  /**
   *
   * @returns {Object}
   */
  get details() {
    return this._details
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
