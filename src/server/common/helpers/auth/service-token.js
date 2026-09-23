import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'

import { config } from '~/src/config/config.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'

/**
 * Creates the token provider. Binds directly to the service's IAM role via AWS STS - no stored secret.
 * Locally, floci has no GetWebIdentityToken support, so a MockProvider stands in instead.
 * @param {string} [audience]
 * @param {number} [earlyRefreshMs]
 * @returns {WebIdentityTokenProvider | MockProvider}
 */
export function getWebIdentityTokenProvider(audience, earlyRefreshMs) {
  return config.get('cdpEnvironment') === 'local'
    ? new MockProvider({})
    : new WebIdentityTokenProvider({
        audience: [audience],
        earlyRefreshMs
      })
}

/**
 * Returns a valid AWS STS Web Identity token, refreshing it if expired.
 * Sent as the raw Bearer token - no second exchange with an identity provider, unlike the Entra flow.
 * @param {WebIdentityTokenProvider | MockProvider} webIdentityTokenProvider
 * @param {string} [audience]
 * @param {string} [label]
 * @returns {Promise<string | undefined>} A valid Web Identity token
 */
export async function getServiceToken(webIdentityTokenProvider, audience, label) {
  const token = await webIdentityTokenProvider.getCredentials(logger)
  if (token) {
    logger.info(`[${label}] Web Identity token ready (audience=${audience})`)
  } else {
    logger.warn(`[${label}] no Web Identity token available (audience=${audience})`)
  }
  return token ?? undefined
}
