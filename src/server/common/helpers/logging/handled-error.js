import { log } from './log.js'
import { BaseError } from '~/src/server/common/utils/errors/BaseError.js'

/**
 * Logs a failure consumed locally, where it will not reach the global error handler.
 * Preserves a structured error's logging policy and causes; ordinary errors use
 * the caller's fallback code and context. Do not also log or rethrow the failure.
 *
 * @param {unknown} error
 * @param {AnyRequest | undefined} request
 * @param {object} options
 * @param {LogCodesDefinition} options.fallbackCode
 * @param {Record<string, unknown>} [options.fallbackDetails]
 */
export function logHandledError(error, request, { fallbackCode, fallbackDetails = {} }) {
  if (error instanceof BaseError) {
    error.log(request)
    return
  }

  const message = error instanceof Error ? error.message : error
  const errorMessage = typeof message === 'string' && message ? message : 'An unknown error occurred'
  log(error instanceof Error ? { ...fallbackCode, error } : fallbackCode, { ...fallbackDetails, errorMessage }, request)
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { LogCodesDefinition } from './log-codes/definition.js'
 */
