/**
 * CV_API_AUTH_ENABLED=false exists so a local or dev grants-ui can talk to
 * grants-platform-dal-stub, which ignores authentication, through the same code
 * path it uses for the real Consolidated View API. The real API always needs the
 * Entra token, so refuse the flag anywhere that could be pointed at it.
 */
const ENVIRONMENTS_REQUIRING_AUTH = new Set(['test', 'prod'])

/**
 * @param {Record<string, any>} config - The convict config object; typed loosely for the same reason as validateBackendAuthConfig
 */
export function validateConsolidatedViewAuthConfig(config) {
  const authEnabled = config.get('consolidatedView.authEnabled')
  const environment = config.get('cdpEnvironment')

  if (!authEnabled && ENVIRONMENTS_REQUIRING_AUTH.has(environment)) {
    throw new Error(
      `CV_API_AUTH_ENABLED=false is not allowed in the ${environment} environment. ` +
        'The Consolidated View API requires an Entra token; only the DAL stub accepts unauthenticated requests.'
    )
  }
}
