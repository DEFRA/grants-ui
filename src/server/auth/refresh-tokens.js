import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { AuthError } from '~/src/server/common/utils/errors/AuthError.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { OutboundService, withOutboundMetrics } from '~/src/server/common/helpers/outbound-call-metrics.js'

const TOKEN_REFRESH_TIMEOUT_MS = 10000

/**
 * @param {string} refreshToken
 * @returns {string} The form-encoded token request body
 */
function buildRefreshRequestBody(refreshToken) {
  const clientId = String(config.get('defraId.clientId'))

  return new URLSearchParams({
    client_id: clientId,
    client_secret: String(config.get('defraId.clientSecret')),
    grant_type: 'refresh_token',
    scope: `openid offline_access ${clientId}`,
    refresh_token: refreshToken,
    redirect_uri: String(config.get('defraId.redirectUrl'))
  }).toString()
}

/**
 * @param {string} url - The Defra Identity token endpoint
 * @param {string} body - The form-encoded token request body
 * @returns {Promise<RefreshTokenPayload>}
 */
async function postRefreshRequest(url, body) {
  const { payload } = await withOutboundMetrics({ service: OutboundService.DEFRA_ID, operation: 'refreshToken' }, () =>
    Wreck.post(url, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: body,
      json: true,
      timeout: TOKEN_REFRESH_TIMEOUT_MS
    })
  )

  return /** @type {RefreshTokenPayload} */ (payload)
}

/**
 * Works out which step of the refresh failed, for the `AuthError` reason.
 * @param {ErrorResponse} error
 * @returns {string}
 */
function getFailedStep(error) {
  const { message } = error

  if (message.includes('OIDC')) {
    return 'oidc_config_fetch'
  }
  if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
    return 'token_endpoint_connection'
  }
  if (message.includes('400') || message.includes('401')) {
    return 'token_endpoint_auth'
  }
  if (message.includes('access_token')) {
    return 'token_refresh_response_validation'
  }
  if (error.statusCode) {
    return 'token_endpoint_response'
  }
  return 'unknown'
}

/**
 * Exchange a refresh token at the Defra Identity token endpoint.
 * @param {string} refreshToken
 * @param {AnyRequest} request
 * @returns {Promise<RefreshTokenPayload>}
 */
async function refreshTokens(refreshToken, request) {
  try {
    const { token_endpoint: url } = await getOidcConfig()
    const payload = await postRefreshRequest(url, buildRefreshRequestBody(refreshToken))

    // Payload will include both a new access token and a new refresh token
    // Refresh tokens can only be used once, so the new refresh token should be stored in place of the old one

    if (!payload.access_token) {
      log(
        LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE,
        {
          userId: 'system',
          errorMessage: 'No access token in refresh response',
          step: 'token_refresh_response_validation'
        },
        request
      )
      throw new Error('No access token in refresh response')
    }

    log(
      LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS,
      {
        userId: 'system',
        organisationId: 'refresh_operation',
        step: 'token_refresh_complete',
        hasNewRefreshToken: !!payload.refresh_token
      },
      request
    )

    return payload
  } catch (error) {
    const authError = new AuthError({
      message: 'Token refresh failed',
      source: 'refreshTokens',
      reason: getFailedStep(/** @type {ErrorResponse} */ (error)),
      statusCode: /** @type {ErrorResponse} */ (error).statusCode,
      hasRefreshToken: !!refreshToken
    })
    authError.logCode = LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE
    throw authError.from(/** @type {Error} */ (error))
  }
}

export { refreshTokens }

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */

/**
 * @typedef {Error & { statusCode?: number }} ErrorResponse
 *
 * @typedef {{
 *   access_token: string,
 *   refresh_token: string,
 *   [key: string]: unknown
 * }} RefreshTokenPayload
 */
