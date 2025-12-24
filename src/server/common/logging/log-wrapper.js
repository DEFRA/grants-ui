import { logger } from '~/src/server/common/helpers/logging/log.js'
import { syntheticError } from './synthetic-error.js'
import { toEcsError } from './ecs-error.js'

/**
 * @param {Error | string | unknown} errOrMessage
 * @returns {Error}
 */
function normaliseError(errOrMessage) {
  if (errOrMessage instanceof Error) {
    return errOrMessage
  }

  if (typeof errOrMessage === 'string') {
    return syntheticError(errOrMessage)
  }

  return syntheticError(JSON.stringify(errOrMessage))
}

/**
 * Logs an error using the ECS-compliant structure.
 *
 * @param {Error | string | unknown} errOrMessage
 * @param {string} [message]
 * @param {Record<string, any>} [meta]
 */
export function logError(errOrMessage, message, meta = {}) {
  const error = normaliseError(errOrMessage)
  const ecsError = toEcsError(error)

  logger.error(
    {
      ...meta,
      error: ecsError
    },
    message ?? error.message
  )
}

/**
 * Logs a warning with ECS error fields.
 *
 * @param {Error | string | unknown} errOrMessage
 * @param {string} [message]
 * @param {Record<string, any>} [meta]
 */
export function logWarn(errOrMessage, message, meta = {}) {
  const error = normaliseError(errOrMessage)
  const ecsError = toEcsError(error)

  logger.warn(
    {
      ...meta,
      error: ecsError
    },
    message ?? error.message
  )
}

/**
 * Logs an informational message (non-error).
 *
 * @param {string} message
 * @param {Record<string, any>} [meta]
 */
export function logInfo(message, meta = {}) {
  logger.info(
    {
      ...meta
    },
    message
  )
}
