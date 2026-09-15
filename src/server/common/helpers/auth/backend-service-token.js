import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'

import { config } from '~/src/config/config.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'

/** @type {WebIdentityTokenProvider | MockProvider | null} */
let webIdentityTokenProvider = null

/**
 * Lazily creates (and caches) the token provider. Binds directly to the
 * service's IAM role via AWS STS - no stored secret. Locally, floci has no
 * GetWebIdentityToken support, so a MockProvider stands in instead.
 * @returns {WebIdentityTokenProvider | MockProvider}
 */
function getWebIdentityTokenProvider() {
  if (!webIdentityTokenProvider) {
    webIdentityTokenProvider =
      config.get('cdpEnvironment') === 'local'
        ? new MockProvider({})
        : new WebIdentityTokenProvider({
            audience: [config.get('session.cache.webIdentity.audience')]
          })
  }
  return webIdentityTokenProvider
}

/**
 * Resets the cached token provider. Test-only.
 * @returns {void}
 */
export function clearCachedBackendServiceToken() {
  webIdentityTokenProvider = null
}

/**
 * Returns a valid AWS STS Web Identity token for grants-ui-backend,
 * refreshing it if expired. Sent as the raw Bearer token - no second
 * exchange with an identity provider, unlike the Entra flow.
 * @returns {Promise<string | undefined>} A valid Web Identity token
 */
export async function getBackendServiceToken() {
  const audience = config.get('session.cache.webIdentity.audience')

  const token = await getWebIdentityTokenProvider().getCredentials(logger)
  if (token) {
    logger.info(`[grants-ui-backend] Web Identity token ready (audience=${audience})`)
  } else {
    logger.warn(`[grants-ui-backend] no Web Identity token available (audience=${audience})`)
  }
  return token ?? undefined
}
