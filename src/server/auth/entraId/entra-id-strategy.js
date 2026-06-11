import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'

async function getEntraIdOptions() {
  const oidcConfig = await getOidcConfig(config.get('entraId.wellKnownUrl'))

  return {
    provider: {
      name: 'entra-id',
      protocol: 'oauth2',
      useParamsAuth: true,
      auth: oidcConfig.authorization_endpoint,
      token: oidcConfig.token_endpoint,
      scope: ['openid', 'profile', 'email', 'offline_access'],
      profile: function (credentials) {
        // Entra ID profile processing logic can be added here
        return credentials
      }
    },
    password: config.get('session.cookie.password'),
    clientId: config.get('entraId.clientId'),
    clientSecret: config.get('entraId.clientSecret'),
    isSecure: config.get('session.cookie.secure'),
    location: config.get('entraId.redirectUrl')
  }
}

export { getEntraIdOptions }
