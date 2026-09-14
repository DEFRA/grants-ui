import { URLSearchParams } from 'node:url'

import { CognitoTokenProvider } from '@defra/hapi-auth-oidc'

import { config } from '~/src/config/config.js'
import { ExternalApiError } from '~/src/server/common/utils/errors/ExternalApiError.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { log, logger, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const clientAssertionType = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'

const msInSec = 1000
const secsInMins = 60
const numMins = 5
const expirationBuffer = numMins * secsInMins * msInSec // refresh tokens 5 minutes before actual expiry

/** @type {CognitoTokenProvider | null} */
let cognitoTokenProvider = null

/**
 * Lazily creates (and caches) the Cognito federated token provider. The
 * logins map key/value are a fixed "grants-ui-aad-access":"grants-ui"
 * convention (matching cdp-api-hub's own hardcoded logins map) rather than
 * environment config - only the identity pool ID varies by environment.
 * @returns {CognitoTokenProvider}
 */
function getCognitoTokenProvider() {
  if (!cognitoTokenProvider) {
    cognitoTokenProvider = new CognitoTokenProvider({
      poolId: config.get('cognito.identityPoolId'),
      logins: { 'grants-ui-aad-access': 'grants-ui' }
    })
  }
  return cognitoTokenProvider
}

/**
 * @typedef {object} TokenState - The state of the OAuth2 token
 * @property {string|null} currentToken - The current OAuth2 token
 * @property {number|null} tokenExpiry - Expiry time of the token in milliseconds
 */

/** @type {TokenState} */
let tokenState = {
  currentToken: null,
  tokenExpiry: null
}

/**
 * Resets the in-memory OAuth2 token state.
 * @returns {void}
 */
export function clearTokenState() {
  tokenState = {
    currentToken: null,
    tokenExpiry: null
  }
  cognitoTokenProvider = null
}

/**
 * Checks if expiryTime has passed for a token
 * @param {number|null} expiryTime - Expiry Time of the token in milliseconds
 * @returns {boolean} - Boolean indicating if the token has expired
 */
export function isTokenExpired(expiryTime) {
  if (!expiryTime) {
    return true
  }
  return Date.now() >= expiryTime - expirationBuffer
}

/**
 * Creates the request parameters for a token request authenticated with a
 * signed federated token (client_assertion), instead of a stored client
 * secret.
 * @param {string} clientId - Client ID
 * @param {string} scope - Scope of the token
 * @param {string} clientAssertion - Signed federated token (e.g. from Cognito)
 * @returns {URLSearchParams} - URLSearchParams object with the request parameters
 */
export function createTokenRequestParams(clientId, scope, clientAssertion) {
  return new URLSearchParams({
    client_id: clientId,
    scope,
    client_assertion_type: clientAssertionType,
    client_assertion: clientAssertion,
    grant_type: 'client_credentials'
  })
}

/**
 * Creates the request parameters for a token request authenticated with a
 * client secret - see entra.clientSecret.
 * @param {string} clientId - Client ID
 * @param {string} scope - Scope of the token
 * @param {string} clientSecret - Client Secret
 * @returns {URLSearchParams} - URLSearchParams object with the request parameters
 */
export function createClientSecretTokenRequestParams(clientId, scope, clientSecret) {
  return new URLSearchParams({
    client_id: clientId,
    scope,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  })
}

/**
 * Marks a failure to obtain a token from Cognito, so refreshToken's catch can
 * log it distinctly from a failure at the Entra token endpoint itself.
 */
class FederatedTokenProviderError extends Error {
  /**
   * @param {Record<string, unknown>} context - Identifying details for the provider (e.g. identityPoolId)
   * @param {Error} cause - The underlying error from the token provider
   */
  constructor(context, cause) {
    super(cause.message)
    this.name = 'FederatedTokenProviderError'
    this.context = context
    this.cause = cause
  }
}

/**
 * Requests a Cognito federated token and returns the client_assertion
 * request params for it.
 * @param {string} clientId - Client ID
 * @param {string} scope - Scope of the token
 * @returns {Promise<URLSearchParams>}
 */
async function buildCognitoTokenRequestParams(clientId, scope) {
  const identityPoolId = config.get('cognito.identityPoolId')

  let clientAssertion
  try {
    clientAssertion = await getCognitoTokenProvider().getCredentials(logger)
  } catch (error) {
    throw new FederatedTokenProviderError({ identityPoolId }, /** @type {Error} */ (error))
  }

  if (!clientAssertion) {
    throw new FederatedTokenProviderError({ identityPoolId }, new Error('Cognito token provider returned no token'))
  }

  return createTokenRequestParams(clientId, scope, clientAssertion)
}

/**
 * Builds the request params for the Entra token exchange, using the
 * authentication method configured for this environment via entra.authMethod.
 * Cognito is being rolled out environment by environment, so this must stay
 * "client_secret" for any environment that does not yet have a working
 * Cognito federated credential.
 * @param {string} clientId - Client ID
 * @param {string} scope - Scope of the token
 * @returns {Promise<URLSearchParams>} - URLSearchParams object with the request parameters
 */
async function buildTokenRequestParams(clientId, scope) {
  const authMethod = config.get('entra.authMethod')

  switch (authMethod) {
    case 'cognito':
      return buildCognitoTokenRequestParams(clientId, scope)

    case 'client_secret':
      return createClientSecretTokenRequestParams(clientId, scope, config.get('entra.clientSecret'))

    default:
      throw new Error(`Unrecognised entra.authMethod: ${authMethod}`)
  }
}

/**
 * @typedef {object} TokenResponse - The response from the token endpoint
 * @property {string} access_token - The OAuth2 access token
 * @property {number} expires_in - The number of seconds until the token expires
 */

/**
 * Refreshes the OAuth2 token by making a POST request to the token endpoint.
 * @async
 * @function refreshToken
 * @returns {Promise<string>} The new access token.
 * @throws {Error} If the request fails or the response is not ok.
 */
export async function refreshToken() {
  const tokenEndpoint = config.get('entra.tokenEndpoint')
  const tenantId = config.get('entra.tenantId')
  const clientId = config.get('entra.clientId')
  const scope = `${clientId}/.default`
  const authMethod = config.get('entra.authMethod')

  try {
    log(LogCodes.SYSTEM.ENTRA_TOKEN_REFRESH_ATTEMPT, { authMethod })

    const params = await buildTokenRequestParams(clientId, scope)

    const response = await retry(
      () =>
        fetch(`${tokenEndpoint}/${tenantId}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        }),
      {
        timeout: 15000,
        checkFetchResponse: true,
        serviceName: 'TokenManager.refreshToken'
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      /**
       * @type {Error & {status?: number}}
       */
      const error = new Error(`Token request failed: ${response.status} ${response.statusText} - ${errorText}`)
      error.status = response.status
      throw error
    }

    const data = await response.json()
    if (typeof data.access_token !== 'string') {
      throw new Error('Invalid token response: missing or invalid access_token')
    }

    tokenState = {
      currentToken: data.access_token,
      tokenExpiry: Date.now() + data.expires_in * 1000
    }

    log(LogCodes.SYSTEM.ENTRA_TOKEN_REFRESH_SUCCESS, { authMethod })

    return tokenState.currentToken ?? ''
  } catch (error) {
    logRefreshTokenError(authMethod, /** @type {Error} */ (error))

    const externalApiError = new ExternalApiError({
      message: 'Entra token refresh failed',
      source: 'refreshToken',
      reason: 'entra_token_refresh_failure',
      endpoint: 'Entra token refresh'
    })
    throw externalApiError.from(/** @type {Error} */ (error))
  }
}

/**
 * Logs why a token refresh failed, distinguishing a failure to obtain a
 * federated token from Cognito from a failure at the Entra token endpoint
 * itself (wrong client secret, audience mismatch, network error, etc).
 * @param {string} authMethod - 'cognito' or 'client_secret'
 * @param {Error & { context?: Record<string, unknown>, status?: number }} error
 * @returns {void}
 */
function logRefreshTokenError(authMethod, error) {
  if (error.name === 'FederatedTokenProviderError') {
    log(LogCodes.SYSTEM.ENTRA_COGNITO_ERROR, {
      identityPoolId: error.context?.identityPoolId,
      errorMessage: error.message
    })
    return
  }

  log(LogCodes.SYSTEM.ENTRA_TOKEN_ENDPOINT_ERROR, {
    authMethod,
    status: error.status,
    errorMessage: error.message
  })
}

/**
 * Gets a valid token, refreshing if necessary
 * @async
 * @function getValidToken
 * @returns {Promise<string>} A valid access token
 * @throws {Error} If unable to get a valid token
 */
export async function getValidToken() {
  if (!isTokenExpired(tokenState.tokenExpiry) && tokenState.currentToken) {
    return tokenState.currentToken
  }

  return refreshToken()
}
