import { ClientAssertionCredential } from '@azure/identity'

import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { getCognitoToken } from '~/src/server/common/helpers/entra/cognito-token.js'

/** @type {ClientAssertionCredential | null} */
let credential = null

/**
 * Gets or creates the ClientAssertionCredential instance.
 * @returns {ClientAssertionCredential}
 */
function getCredential() {
  if (!credential) {
    const tenantId = config.get('entra.tenantId')
    const clientId = config.get('entra.clientId')

    credential = new ClientAssertionCredential(tenantId, clientId, getCognitoToken)
  }
  return credential
}

/**
 * Resets the credential instance (useful for testing).
 */
export function clearTokenState() {
  credential = null
}

/**
 * Gets a valid access token using federated credentials via AWS Cognito.
 * Uses ClientAssertionCredential which handles token caching and refresh internally.
 * @async
 * @function getValidToken
 * @returns {Promise<string>} A valid access token
 * @throws {Error} If unable to get a valid token
 */
export async function getValidToken() {
  const clientId = config.get('entra.clientId')
  const scope = `${clientId}/.default`

  try {
    const tokenResponse = await getCredential().getToken(scope)
    return tokenResponse.token
  } catch (error) {
    log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      endpoint: 'Entra token refresh',
      errorMessage: error.message
    })
    throw error
  }
}
