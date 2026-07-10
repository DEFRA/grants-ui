import { getOidcConfig } from './get-oidc-config.js'

/**
 * Resolve the browser-facing origin used by the configured identity provider.
 * OIDC discovery is an implementation detail of this identity-provider boundary.
 *
 * @returns {Promise<string | null>}
 */
async function getIdentityProviderOrigin() {
  const oidcConfig = await getOidcConfig()
  const authorizationEndpoint = oidcConfig?.authorization_endpoint

  if (typeof authorizationEndpoint !== 'string' || !URL.canParse(authorizationEndpoint)) {
    return null
  }

  const url = new URL(authorizationEndpoint)
  return url.protocol === 'https:' ? url.origin : null
}

export { getIdentityProviderOrigin }
