import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'

async function getEntraIdOptions() {
  // Always derive from tenantId so ENTRA_INTERNAL_TENANT_ID is the single value to set.
  // ENTRA_INTERNAL_CONFIG_URL overrides only when explicitly provided (differs from the config default).
  const tenantId = config.get('entraId.tenantId')
  const configuredUrl = config.get('entraId.wellKnownUrl')
  const derivedUrl = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
  const wellKnownUrl = configuredUrl !== config.default('entraId.wellKnownUrl') ? configuredUrl : derivedUrl

  // Derive the redirect base URL from CDP environment name.
  // Bell appends the route path (/auth/entra-id-poc) to produce the full redirect URI sent to Azure.
  // ENTRA_INTERNAL_REDIRECT_URL overrides this for prod vanity URLs or local dev.
  const cdpEnvironment = config.get('cdpEnvironment')
  const configuredRedirectUrl = config.get('entraId.redirectUrl')
  const derivedRedirectUrl = `https://grants-ui.${cdpEnvironment}.cdp-int.defra.cloud`
  const location =
    configuredRedirectUrl !== config.default('entraId.redirectUrl') ? configuredRedirectUrl : derivedRedirectUrl

  log(LogCodes.AUTH.ENTRA_ID_CONFIG, {
    redirectUri: `${location}/auth/entra-id-poc`,
    wellKnownUrl
  })

  const oidcConfig = await getOidcConfig(wellKnownUrl)
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
    location
  }
}

export { getEntraIdOptions }
