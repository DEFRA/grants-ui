import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'

async function refreshTokens(refreshToken) {
  const { token_endpoint: url } = await getOidcConfig()

  const query = [
    `client_id=${config.get('defraId.clientId')}`,
    `client_secret=${config.get('defraId.clientSecret')}`,
    'grant_type=refresh_token',
    `scope=openid offline_access ${config.get('defraId.clientId')}`,
    `refresh_token=${refreshToken}`,
    `redirect_uri=${config.get('defraId.redirectUrl')}`
  ].join('&')

  const { payload } = await Wreck.post(`${url}?${query}`, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    json: true
  })

  // Payload will include both a new access token and a new refresh token
  // Refresh tokens can only be used once, so the new refresh token should be stored in place of the old one
  return payload
}

export { refreshTokens }
