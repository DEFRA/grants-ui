/**
 * @typedef {Object} AppErrorOptions
 * @property {string} [code]
 * @property {Object} [context]
 * @property {boolean} [alreadyLogged]
 */

/**
 * @param {string} message
 * @param {AppErrorOptions} [options]
 */
export class AppError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = this.constructor.name

    const { code, context = {}, alreadyLogged = false } = options

    this.code = code
    this.context = context
    this.alreadyLogged = alreadyLogged
    Error.captureStackTrace(this, this.constructor)
  }
}
