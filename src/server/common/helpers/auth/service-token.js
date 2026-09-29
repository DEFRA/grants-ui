import jwt from 'jsonwebtoken'
import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'

import { config } from '~/src/config/config.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'

// Library default (300s) collides with the ~300s ECS container credential
// refresh window, causing STS to occasionally reject the request (prod, 2026-09-28).
// See #cdp-support, 2026-09-29.
const DURATION_SECONDS = 60

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
        earlyRefreshMs,
        durationSeconds: DURATION_SECONDS
      })
}

/**
 * Whether a JWT's `exp` has passed. WebIdentityTokenProvider can silently
 * return a stale cached token after a failed refresh, so this catches it.
 * @param {string} token
 * @returns {boolean}
 */
export function isExpired(token) {
  const decoded = jwt.decode(token)
  if (!decoded || typeof decoded === 'string' || typeof decoded.exp !== 'number') {
    return true
  }
  return Date.now() >= decoded.exp * 1000
}

/**
 * Diagnostic: logs how close the ECS task's own AWS credentials were to
 * expiry when a Web Identity refresh failed. Best-effort - MockProvider has
 * no stsClient, so every error here is swallowed.
 * @param {WebIdentityTokenProvider | MockProvider} webIdentityTokenProvider
 * @param {string} [label]
 * @returns {Promise<void>}
 */
export async function logUnderlyingCredentialExpiry(webIdentityTokenProvider, label) {
  try {
    const credentials = await webIdentityTokenProvider.stsClient?.config?.credentials?.()
    if (!credentials?.expiration) {
      return
    }
    const msRemaining = credentials.expiration.getTime() - Date.now()
    logger.warn(
      `[${label}] underlying ECS task credentials expire at ${credentials.expiration.toISOString()} (${msRemaining}ms from now)`
    )
  } catch (error) {
    logger.warn(`[${label}] could not read underlying ECS task credential expiry: ${error.message}`)
  }
}

/**
 * Returns a valid AWS STS Web Identity token, refreshing it if expired.
 * Sent as the raw Bearer token - no second exchange, unlike the Entra flow.
 * No retry on failure: fails fast rather than masking a genuine STS problem.
 * @param {WebIdentityTokenProvider | MockProvider} webIdentityTokenProvider
 * @param {string} [audience]
 * @param {string} [label]
 * @returns {Promise<string | undefined>} A valid Web Identity token
 */
export async function getServiceToken(webIdentityTokenProvider, audience, label) {
  const token = await webIdentityTokenProvider.getCredentials(logger)
  if (token && !isExpired(token)) {
    logger.info(`[${label}] Web Identity token ready (audience=${audience})`)
    return token
  }

  logger.warn(`[${label}] no valid Web Identity token available (audience=${audience})`)
  await logUnderlyingCredentialExpiry(webIdentityTokenProvider, label)
  return undefined
}
