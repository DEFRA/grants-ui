import { logger } from '~/src/server/common/helpers/logging/log.js'
import { HTTP_STATUS } from '~/src/server/common/helpers/errors.js'

/**
 * Retry an asynchronous operation with configurable options
 * @template T
 * @param {() => Promise<T>} operation - Async function to retry
 * @param {RetryOptions} [options] - Retry configuration
 * @returns {Promise<T>} - Result of the operation
 * @throws {Error} - Last error encountered after all retry attempts
 */
export async function retry(operation, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    exponential = true,
    shouldRetry = () => true,
    timeout = 15000,
    checkFetchResponse = false,
    onRetry = (error, attempt, delay) => {
      const message = `${serviceName} retry attempt ${attempt}/${maxAttempts} after error: ${error.message}; retrying in ${delay}ms`
      logger.debug(error, message)
    },
    serviceName = 'RetryableOperation'
  } = options

  /** @type {Error | undefined} */
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await race(operation, timeout)

      if (
        checkFetchResponse &&
        isFetchFailure(result) &&
        attempt < maxAttempts &&
        /** @type {{ status: number }} */ (result).status !== HTTP_STATUS.NOT_FOUND &&
        shouldRetry(new Error(`HTTP ${/** @type {{ status: number }} */ (result).status}`))
      ) {
        const errorMessage = `Request failed with status ${/** @type {{ status: number }} */ (result).status}: ${/** @type {{ statusText: string }} */ (result).statusText}`
        throw new Error(errorMessage)
      }

      return result
    } catch (error) {
      lastError = /** @type {Error} */ (error)

      if (attempt === maxAttempts || !shouldRetry(/** @type {Error} */ (error))) {
        break
      }

      const delay = getDelay(exponential, initialDelay, attempt, maxDelay)

      onRetry(/** @type {Error} */ (error), attempt, delay)

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Race an operation against a timeout
 * @template T
 * @param {() => Promise<T>} operation
 * @param {number} [timeout]
 * @returns {Promise<T>}
 */
async function race(operation, timeout = 5000) {
  return await Promise.race([
    operation(),
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
    )
  ])
}

/**
 * Calculate delay for a retry attempt
 * @param {boolean} exponential
 * @param {number} initialDelay
 * @param {number} attempt
 * @param {number} maxDelay
 * @returns {number}
 */
function getDelay(exponential, initialDelay, attempt, maxDelay) {
  if (exponential) {
    const jitter = 1 + Math.random() * 0.5
    return Math.min(initialDelay * Math.pow(2, attempt - 1) * jitter, maxDelay)
  }

  return initialDelay
}

/**
 * Check if a fetch result indicates a failure
 * @param {unknown} result
 * @returns {unknown}
 */
function isFetchFailure(result) {
  return result && typeof result === 'object' && 'ok' in result && !(/** @type {{ ok: boolean }} */ (result).ok)
}

/**
 * @typedef {object} RetryOptions
 * @property {number} [maxAttempts=3] - Maximum number of retry attempts
 * @property {number} [initialDelay=1000] - Initial delay in milliseconds
 * @property {number} [maxDelay=30000] - Maximum delay in milliseconds
 * @property {boolean} [exponential=true] - Whether to use exponential backoff
 * @property {(error: Error) => boolean} [shouldRetry] - Function to determine if a retry should be attempted
 * @property {number} [timeout=15000] - Operation timeout in milliseconds (default: 15 seconds)
 * @property {boolean} [checkFetchResponse] - Whether to check fetch response.ok from operation
 * @property {(error: Error, attempt: number, delay: number) => void} [onRetry] - Called before each retry attempt
 * @property {string} [serviceName] - Name of the service for logging purposes
 */
