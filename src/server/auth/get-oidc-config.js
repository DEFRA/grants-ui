import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

// This fetch happens on cold start (auth plugin registration). A
// single transient blip here crash-loops the container, so give it a bounded
// timeout and a few retries before giving up.
const OIDC_FETCH_TIMEOUT_MS = 10000
const OIDC_FETCH_MAX_ATTEMPTS = 3
const OIDC_FETCH_RETRY_BASE_DELAY_MS = 1000
// Random jitter added to each retry delay so failing containers don't all retry
// in lockstep and stampede the well-known endpoint.
const OIDC_FETCH_RETRY_JITTER_MS = 500

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getOidcConfig(url = config.get('defraId.wellKnownUrl'), options = { json: true }) {
  // Fetch the OpenID Connect configuration from the well-known endpoint
  // Contains the URLs for authorisation, sign out, token and public keys in JSON format
  let lastError
  for (let attempt = 1; attempt <= OIDC_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const { payload } = await Wreck.get(url, {
        json: true,
        timeout: OIDC_FETCH_TIMEOUT_MS
      })

      return payload
    } catch (error) {
      lastError = error
    }

    // Logged outside the catch so the lint rule that bars log helpers inside
    // catch blocks is satisfied while still using structured log codes.
    const err = /** @type {Error & { code?: string }} */ (lastError)
    log(LogCodes.AUTH.OIDC_CONFIG_FETCH_RETRY, {
      attempt,
      maxAttempts: OIDC_FETCH_MAX_ATTEMPTS,
      wellKnownUrl: url,
      code: err.code ?? 'n/a',
      errorMessage: err.message
    })

    if (attempt < OIDC_FETCH_MAX_ATTEMPTS) {
      // Math.random() is fine here: the jitter only decorrelates retry timing.
      // It is not used for any security purpose, so aCSPRNG is unnecessary.
      const jitter = Math.random() * OIDC_FETCH_RETRY_JITTER_MS // NOSONAR S2245 - non-cryptographic jitter
      await delay(OIDC_FETCH_RETRY_BASE_DELAY_MS * attempt + jitter)
    }
  }

  throw lastError
}

export { getOidcConfig }
