import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

/**
 * Retry an asynchronous operation with configurable options
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry configuration
 * @param {number} [options.maxAttempts=3] - Maximum number of retry attempts
 * @param {number} [options.initialDelay=1000] - Initial delay in milliseconds
 * @param {number} [options.maxDelay=30000] - Maximum delay in milliseconds
 * @param {boolean} [options.exponential=true] - Whether to use exponential backoff
 * @param {Function} [options.shouldRetry] - Function to determine if a retry should be attempted
 * @param {number} [options.timeout] - Operation timeout in milliseconds
 * @param {boolean} [options.checkFetchResponse] - Whether to check fetch response.ok from operation
 * @param {Function} [options.onRetry] - Called before each retry attempt
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
    timeout,
    checkFetchResponse = false,
    onRetry = (error, attempt) => {
      const message = `Retry attempt ${attempt}/${maxAttempts} after error: ${error.message}`
      createLogger().error(error, message)
    }
  } = options

  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let result
      if (timeout) {
        return await Promise.race([
          operation(),
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
          )
        ])
      } else {
        result = await operation()
      }

      // If we're checking fetch responses and it's not OK, but not at max attempts, throw to trigger retry
      if (checkFetchResponse && result && typeof result === 'object' && 'ok' in result && !result.ok) {
        if (attempt < maxAttempts && shouldRetry(new Error(`HTTP ${result.status}`))) {
          const errorMessage = `Request failed with status ${result.status}: ${result.statusText}`
          throw new Error(errorMessage)
        }
      }

      return result
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts || !shouldRetry(error)) {
        break
      }

      const jitter = 1 + Math.random() * 0.5 // NOSONAR - Math.random() is safe for non-cryptographic jitter in retry delays
      const delay = exponential ? Math.min(initialDelay * Math.pow(2, attempt - 1) * jitter, maxDelay) : initialDelay

      onRetry(error, attempt, delay)

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
