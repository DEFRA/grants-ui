import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { AuthError } from '~/src/server/common/utils/errors/AuthError.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * Exchange a refresh token at the Defra Identity token endpoint.
 * @param {string} refreshToken
 * @param {AnyRequest} request
 * @returns {Promise<RefreshTokenPayload>}
 */
async function refreshTokens(refreshToken, request) {
  try {
    const { token_endpoint: url } = await getOidcConfig()

    const query = [
      `client_id=${String(config.get('defraId.clientId'))}`,
      `client_secret=${String(config.get('defraId.clientSecret'))}`,
      'grant_type=refresh_token',
      `scope=openid offline_access ${String(config.get('defraId.clientId'))}`,
      `refresh_token=${refreshToken}`,
      `redirect_uri=${String(config.get('defraId.redirectUrl'))}`
    ].join('&')

    const { payload } = await Wreck.post(`${url}?${query}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      json: true
    })

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
    let step
    if (/** @type {ErrorResponse} */ (error).message.includes('OIDC')) {
      step = 'oidc_config_fetch'
    } else if (
      /** @type {ErrorResponse} */ (error).message.includes('ENOTFOUND') ||
      /** @type {ErrorResponse} */ (error).message.includes('ECONNREFUSED')
    ) {
      step = 'token_endpoint_connection'
    } else if (
      /** @type {ErrorResponse} */ (error).message.includes('400') ||
      /** @type {ErrorResponse} */ (error).message.includes('401')
    ) {
      step = 'token_endpoint_auth'
    } else if (/** @type {ErrorResponse} */ (error).message.includes('access_token')) {
      step = 'token_refresh_response_validation'
    } else if (/** @type {ErrorResponse} */ (error).statusCode) {
      step = 'token_endpoint_response'
    } else {
      step = 'unknown'
    }

    const authError = new AuthError({
      message: 'Token refresh failed',
      source: 'refreshTokens',
      reason: step,
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
