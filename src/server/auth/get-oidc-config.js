import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'

// This fetch happens on cold start (auth plugin registration). A
// single transient blip here crash-loops the container, so give it a bounded
// timeout and a few retries before giving up.
const OIDC_FETCH_TIMEOUT_MS = 10000
const OIDC_FETCH_MAX_ATTEMPTS = 3
const OIDC_FETCH_RETRY_BASE_DELAY_MS = 1000

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getOidcConfig() {
  // Fetch the OpenID Connect configuration from the well-known endpoint
  // Contains the URLs for authorisation, sign out, token and public keys in JSON format
  const wellKnownUrl = config.get('defraId.wellKnownUrl')

  let lastError
  for (let attempt = 1; attempt <= OIDC_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const { payload } = await Wreck.get(wellKnownUrl, {
        json: true,
        timeout: OIDC_FETCH_TIMEOUT_MS
      })

      return payload
    } catch (error) {
      lastError = error
      const err = /** @type {Error & { code?: string }} */ (error)
      logger.warn(
        `OIDC well-known fetch attempt ${attempt}/${OIDC_FETCH_MAX_ATTEMPTS} failed for ${wellKnownUrl}: ` +
          `code=${err.code ?? 'n/a'} message=${err.message}`
      )

      if (attempt < OIDC_FETCH_MAX_ATTEMPTS) {
        await delay(OIDC_FETCH_RETRY_BASE_DELAY_MS * attempt)
      }
    }
  }

  throw lastError
}

export { getOidcConfig }
