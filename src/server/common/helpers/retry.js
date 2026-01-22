import { logger } from '~/src/server/common/helpers/logging/log.js'
/**
 * Retry an asynchronous operation with configurable options
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry configuration
 * @param {number} [options.maxAttempts=3] - Maximum number of retry attempts
 * @param {number} [options.initialDelay=1000] - Initial delay in milliseconds
 * @param {number} [options.maxDelay=30000] - Maximum delay in milliseconds
 * @param {boolean} [options.exponential=true] - Whether to use exponential backoff
 * @param {Function} [options.shouldRetry] - Function to determine if a retry should be attempted
 * @param {number} [options.timeout=15000] - Operation timeout in milliseconds (default: 15 seconds)
 * @param {boolean} [options.checkFetchResponse] - Whether to check fetch response.ok from operation
 * @param {Function} [options.onRetry] - Called before each retry attempt
 * @param {string} [options.serviceName] - Name of the service for logging purposes
 * @returns {Promise<any>} - Result of the operation
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

  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await race(operation, timeout)

      if (
        checkFetchResponse &&
        isFetchFailure(result) &&
        attempt < maxAttempts &&
        shouldRetry(new Error(`HTTP ${result.status}`))
      ) {
        const errorMessage = `Request failed with status ${result.status}: ${result.statusText}`
        throw new Error(errorMessage)
      }

      return result
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts || !shouldRetry(error)) {
        break
      }

      const delay = getDelay(exponential, initialDelay, attempt, maxDelay)

      onRetry(error, attempt, delay)

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Race an operation against a timeout
 * @param operation {Function}
 * @param timeout {number}
 * @returns {Promise}
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
 * @param exponential {boolean}
 * @param initialDelay {number}
 * @param attempt {number}
 * @param maxDelay {number}
 * @returns {number|*}
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
 * @param result
 * @returns {boolean}
 */
function isFetchFailure(result) {
  return result && typeof result === 'object' && 'ok' in result && !result.ok
}
