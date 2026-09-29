import { getServiceToken, getWebIdentityTokenProvider } from '~/src/server/common/helpers/auth/service-token.js'
import { config } from '~/src/config/config.js'

const REFRESH_MS = 20_000

let webIdentityTokenProvider = null

/**
 * Resets the cached token provider. Test-only.
 * @returns {void}
 */
export function clearCachedScoringServiceToken() {
  webIdentityTokenProvider = null
}

/**
 * Returns a valid AWS STS Web Identity token for grants-scoring-api,
 * refreshing it if expired. Sent as the raw Bearer token - no second
 * exchange with an identity provider, unlike the Entra flow.
 * @returns {Promise<string | undefined>} A valid Web Identity token
 */
export async function getScoringServiceToken() {
  const audience = config.get('scoring.serviceAuth.audience')

  if (!webIdentityTokenProvider) {
    webIdentityTokenProvider = getWebIdentityTokenProvider(audience, REFRESH_MS)
  }

  return getServiceToken(webIdentityTokenProvider, audience, 'grants-scoring-api')
}
