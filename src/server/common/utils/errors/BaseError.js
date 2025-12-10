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
}
