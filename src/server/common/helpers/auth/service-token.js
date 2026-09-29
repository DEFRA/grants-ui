import jwt from 'jsonwebtoken'
import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'

import { config } from '~/src/config/config.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'

// CDP (per #cdp-support, 2026-09-29): the ECS task's own container credentials
// are refreshed ~300s before they expire, with jitter. Requesting the library's
// 300s default therefore asks for the same width as that refresh window itself -
// a request landing close to the refresh boundary can ask for a token that would
// outlive the (about to be replaced) container credentials, and STS rejects it
// ("Requested token expiry time must be before the original session's expiry
// time" - seen in prod 2026-09-28). A much shorter duration leaves comfortable
// room regardless of where in the refresh cycle the request lands.
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
 * Whether a JWT's `exp` claim has already passed. Used to detect
 * WebIdentityTokenProvider silently handing back a stale token after a
 * failed refresh (it returns the last cached token rather than throwing) -
 * treated as `true` for anything we can't decode, so a malformed token is
 * never mistaken for a valid one.
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
 * Logs how close the ECS task's own AWS credentials (the ones underlying
 * every STS call, including GetWebIdentityToken - see #cdp-support,
 * 2026-09-29) were to their own expiry when a Web Identity refresh failed or
 * returned a stale token. `stsClient.config.credentials` is the SDK's own
 * memoized credential resolver (the same one whose 300s-before-expiry refresh
 * threshold is suspected of colliding with our token requests) - calling it
 * here reuses its cache rather than forcing a fresh fetch. Best-effort only:
 * MockProvider has no stsClient, and any failure here must never affect the
 * caller, so every error is swallowed.
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
 * Sent as the raw Bearer token - no second exchange with an identity provider, unlike the Entra flow.
 *
 * WebIdentityTokenProvider.getCredentials() can return a stale, already-expired
 * token after a failed refresh (it logs the failure but returns the last cached
 * token rather than null/throwing) - checking the token's own `exp` here stops
 * that stale token being reported as "ready" and sent on to a request that can
 * only fail. No retry: a failure here reflects a genuine upstream STS problem
 * (see AUTH-AND-SECURITY.md), and surfacing it immediately keeps that visible
 * rather than masking it behind an extra attempt.
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
