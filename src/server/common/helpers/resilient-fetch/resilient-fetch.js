import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

export async function resilientFetch(url, options = {}) {
  const { retries = 0, timeout = 5000, retryDelay = 1000, ...fetchOptions } = options

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      return response
    } catch (err) {
      clearTimeout(timeoutId)

      const isLast = attempt === retries
      const isAbort = err.name === 'AbortError'

      if (isLast) throw err

      createLogger().warn(
        `Fetch attempt ${attempt + 1} for ${url} failed (${isAbort ? 'timeout' : err.message}), retrying...`
      )
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
    }
  }
}
