import { getServiceToken, getWebIdentityTokenProvider } from '~/src/server/common/helpers/auth/service-token.js'
import { config } from '~/src/config/config.js'

// grants-ui-backend checks the token's exp on receipt, so refresh early enough
// that a token can't expire mid-request (request budget plus clock-skew slack).
const EARLY_REFRESH_MS = 20_000

let webIdentityTokenProvider = null

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

  if (!webIdentityTokenProvider) {
    webIdentityTokenProvider = getWebIdentityTokenProvider(audience, EARLY_REFRESH_MS)
  }

  return getServiceToken(webIdentityTokenProvider, audience, 'grants-ui-backend')
}
