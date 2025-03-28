import { URLSearchParams } from 'url'

import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

const logger = createLogger()
const msInSec = 1000
const secsInMins = 60
const numMins = 5
const expirationBuffer = numMins * secsInMins * msInSec // refresh tokens 5 minutes before actual expiry

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

export function clearTokenState() {
  tokenState = {
    currentToken: null,
    tokenExpiry: null
  }
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
 * Creates the request parameters for the token request
 * @param {string} clientId - Client ID
 * @param {string} scope - Scope of the token
 * @param {string} clientSecret - Client Secret
 * @returns {URLSearchParams} - URLSearchParams object with the request parameters
 */
export function createTokenRequestParams(clientId, scope, clientSecret) {
  return new URLSearchParams({
    client_id: clientId,
    scope,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  })
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
  const clientSecret = config.get('entra.clientSecret')
  const scope = `${clientId}/.default`

  try {
    const params = createTokenRequestParams(clientId, scope, clientSecret)

    const response = await fetch(
      `${tokenEndpoint}/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText)
    }

    const data = await response.json()
    if (typeof data.access_token !== 'string') {
      throw new Error('Invalid token response: missing or invalid access_token')
    }

    tokenState = {
      currentToken: data.access_token,
      tokenExpiry: Date.now() + data.expires_in * 1000
    }

    return tokenState.currentToken ?? ''
  } catch (error) {
    logger.error(error, `Failed to refresh token`)
    throw error
  }
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
