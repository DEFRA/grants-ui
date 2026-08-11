import { WebIdentityTokenProvider, MockProvider } from '@defra/hapi-auth-oidc'
import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * @returns {import('@defra/hapi-auth-oidc').WebIdentityTokenProvider | import('@defra/hapi-auth-oidc').MockProvider}
 */
function buildAuthProvider() {
  if (config.get('entraId.federatedCredentials.enableMocking')) {
    return new MockProvider({})
  }

  return new WebIdentityTokenProvider({
    audience: [config.get('entraId.federatedCredentials.audience')],
    earlyRefreshMs: config.get('entraId.federatedCredentials.earlyRefreshMs')
  })
}

/**
 * Builds the `oidc`/`cookieOptions` registration options for `hapiAuthOidcPlugin`.
 *
 * @returns {{ oidc: object, cookieOptions: object }}
 */
function getEntraIdOidcOptions() {
  // Always derive from tenantId so ENTRA_FEDERATED_TENANT_ID is the single value to set.
  // ENTRA_FEDERATED_DISCOVERY_URI overrides only when explicitly provided (differs from the config default).
  const tenantId = config.get('entraId.tenantId')
  const configuredDiscoveryUri = config.get('entraId.discoveryUri')
  const derivedDiscoveryUri = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
  const discoveryUri =
    configuredDiscoveryUri !== config.default('entraId.discoveryUri') ? configuredDiscoveryUri : derivedDiscoveryUri

  // Derive the external base URL from the CDP environment name. APP_BASE_URL overrides this
  // for prod vanity URLs or local dev.
  const cdpEnvironment = config.get('cdpEnvironment')
  const configuredBaseUrl = config.get('baseUrl')
  const derivedBaseUrl = `https://grants-ui.${cdpEnvironment}.cdp-int.defra.cloud`
  const externalBaseUrl = configuredBaseUrl || derivedBaseUrl

  const loginCallbackUri = config.get('entraId.loginCallbackUri')

  log(LogCodes.AUTH.ENTRA_ID_CONFIG, {
    redirectUri: new URL(loginCallbackUri, externalBaseUrl).toString(),
    wellKnownUrl: discoveryUri
  })

  return {
    oidc: {
      clientId: config.get('entraId.clientId'),
      discoveryUri,
      authProvider: buildAuthProvider(),
      useHttp: config.get('entraId.useHttp'),
      loginCallbackUri,
      scope: config.get('entraId.scope'),
      externalBaseUrl,
      // Hardcoded, and deliberately not configurable. `query` makes Azure return the result via a
      // top-level GET navigation, so both the plugin's PKCE state cookie and the app's yar cookie
      // (each SameSite=Lax) are still sent. Under `form_post` the callback is a cross-site POST and
      // browsers withhold Lax cookies, which breaks the PKCE exchange outright and silently loses
      // the post-login redirect. Switching to form_post therefore means changing three things
      // together - the callback route's method, cookieOptions.isSameSite ('None') and isSecure
      // (true) - so it must not be a single env var. Note the plugin's own Joi schema defaults
      // responseMode to 'form_post', so this must always be passed explicitly.
      responseMode: 'query'
    },
    cookieOptions: {
      password: config.get('entraId.cookie.password'),
      isSecure: config.get('entraId.cookie.isSecure'),
      isSameSite: config.get('entraId.cookie.isSameSite')
    }
  }
}

export { getEntraIdOidcOptions }
