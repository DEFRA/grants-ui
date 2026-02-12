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
   * Collection of errors that caused this error.
   * @type {Set<BaseError>}
   */
  causeErrors = new Set()

  /**
   * Collection of errors that were caused by this error.
   * @type {Set<BaseError>}
   */
  effectErrors = new Set()

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

    const lastErrors = this.causeErrors

    for (const lastError of lastErrors) {
      lastError.log(request, { isChainedError: true })
    }
  }

  /**
   * Chain this error from another error, indicating that the previous error led to this error
   * @param {BaseError|Error} error
   * @returns {this}
   * @throws {GenericError} If adding this relationship would create a circular reference
   */

  from(error) {
    if (!error) {
      return this
    }

    const causeError = this._parseError(error)

    if (this === causeError) {
      throw new GenericError({
        message: 'Circular error reference detected: Cannot chain an error to itself',
        source: `${this.name}.from`,
        reason: 'circularReference'
      })
    }

    if (this._wouldCreateCircularReference(causeError, 'cause')) {
      throw new GenericError({
        message: 'Circular error reference detected in error chain',
        source: `${this.name}.from`,
        reason: 'circularReference',
        errorDetails: {
          currentError: this.constructor.name,
          causeError: causeError.constructor.name
        }
      })
    }

    this.causeErrors.add(causeError)

    if (!causeError.effectErrors.has(this)) {
      causeError.effectErrors.add(this)
    }

    return this
  }

  /**
   * Chain another error to this error, indicating that this error led to the next error
   * @param {BaseError|Error} error
   * @returns {this}
   * @throws {GenericError} If adding this relationship would create a circular reference
   */
  chain(error) {
    if (!error) {
      return this
    }

    const effectError = this._parseError(error)

    if (this === effectError) {
      throw new GenericError({
        message: 'Circular error reference detected: Cannot chain an error to itself',
        source: `${this.name}.chain`,
        reason: 'circularReference'
      })
    }

    // Check if adding this effect would create a circular reference in the chain
    if (this._wouldCreateCircularReference(effectError, 'effect')) {
      throw new GenericError({
        message: 'Circular error reference detected in error chain',
        source: `${this.name}.chain`,
        reason: 'circularReference',
        errorDetails: {
          currentError: this.constructor.name,
          effectError: effectError.constructor.name
        }
      })
    }

    this.effectErrors.add(effectError)

    if (!effectError.causeErrors.has(this)) {
      effectError.causeErrors.add(this)
    }

    return this
  }

  /**
   * Checks if adding the specified error would create a circular reference
   * @param {BaseError} error
   * @param {'cause'|'effect'} type
   * @returns {boolean}
   * @private
   */
  _wouldCreateCircularReference(error, type) {
    const visited = new Set()
    visited.add(this)

    const queue = [error]

    while (queue.length > 0) {
      const current = queue.shift()

      if (!current) {
        continue
      }

      if (visited.has(current)) {
        return true
      }

      visited.add(current)

      if (type === 'cause') {
        for (const causeError of current.causeErrors) {
          queue.push(causeError)
        }
      } else {
        for (const effectError of current.effectErrors) {
          queue.push(effectError)
        }
      }
    }

    return false
  }

  /**
   * Parse an error into a BaseError instance, wrapping it if necessary
   * @param {BaseError|Error} error
   * @return {BaseError}
   * @private
   */
  _parseError(error) {
    /** @type {BaseError} */
    let baseError

    if (error instanceof Error && !(error instanceof BaseError)) {
      baseError = BaseError.wrap(error)
    } else {
      baseError = error
    }

    return baseError
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

/**
 * Wraps an error in an instance of this error class
 * @param {Error} error
 * @return {GenericError}
 */
BaseError.wrap = function (error) {
  const errorProperties = {
    message: error.message || 'An unknown error occurred',
    source: 'unknown',
    reason: error instanceof Error ? 'wrappedError' : 'emptyError',
    originalError: error
  }

  return new GenericError(errorProperties)
}

/**
 * Finds the root error (the error at the top of the chain)
 * @param {BaseError} error
 * @returns {BaseError[]} The root error with no more effect errors
 */
BaseError.findRootErrors = function (error) {
  const rootErrors = new Set()
  const visited = new Set()
  const queue = [error]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current || visited.has(current)) {
      continue
    }

    visited.add(current)

    if (current && current.effectErrors.size === 0) {
      rootErrors.add(current)
    } else if (current) {
      for (const effect of current.effectErrors) {
        if (!visited.has(effect) && !queue.includes(effect)) {
          queue.push(effect)
        }
      }
    }
  }

  return Array.from(rootErrors)
}

/**
 * A generic error class to use when the error does not fit into any other specific error class
 */
export class GenericError extends BaseError {
  logCode = LogCodes.SYSTEM.GENERIC_ERROR
}
