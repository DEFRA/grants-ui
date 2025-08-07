import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

async function refreshTokens(refreshToken) {
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
      log(LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE, {
        userId: 'system',
        error: 'No access token in refresh response',
        step: 'token_refresh_response_validation'
      })
      throw new Error('No access token in refresh response')
    }

    log(LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS, {
      userId: 'system',
      organisationId: 'refresh_operation',
      step: 'token_refresh_complete',
      hasNewRefreshToken: !!payload.refresh_token
    })

    return payload
  } catch (error) {
    let step
    if (error.message.includes('OIDC')) {
      step = 'oidc_config_fetch'
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      step = 'token_endpoint_connection'
    } else if (error.message.includes('400') || error.message.includes('401')) {
      step = 'token_endpoint_auth'
    } else if (error.message.includes('access_token')) {
      step = 'token_refresh_response_validation'
    } else if (error.statusCode) {
      step = 'token_endpoint_response'
    } else {
      step = 'unknown'
    }

    log(LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE, {
      userId: 'system',
      error: error.message,
      step,
      statusCode: error.statusCode,
      hasRefreshToken: !!refreshToken
    })

    // Mark error as already logged to prevent duplicate logging in global handler
    error.alreadyLogged = true
    throw error
  }
}

export { refreshTokens }
