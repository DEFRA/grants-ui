import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { createState } from '~/src/server/auth/state.js'

/**
 * Build the Defra Identity end-session request (endpoint and parameters) for the current user.
 * @param {AnyRequest} request
 * @param {string} token
 * @returns {Promise<SignOutRequest>}
 */
async function getSignOutRequest(request, token) {
  const { end_session_endpoint: endpoint } = await getOidcConfig()

  /** @type {string} */
  const signOutRedirectUrl = config.get('defraId.signOutRedirectUrl')

  // To prevent CSRF attacks, the state parameter should be passed during redirection
  // It should be verified when the user is redirected back to the application
  // The `createState` function generates a unique state value and stores it in the session
  const state = createState(request)

  return {
    endpoint,
    fields: { post_logout_redirect_uri: signOutRedirectUrl, id_token_hint: token, state }
  }
}

/**
 * Build the Defra Identity end-session URL for the current user (GET form, used with the stub).
 * @param {AnyRequest} request
 * @param {string} token
 * @returns {Promise<string>}
 */
async function getSignOutUrl(request, token) {
  const { endpoint, fields } = await getSignOutRequest(request, token)
  const query = Object.entries(fields)
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
  return encodeURI(`${endpoint}?${query}`)
}

export { getSignOutRequest, getSignOutUrl }

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */

/**
 * @typedef {object} SignOutRequest
 * @property {string} endpoint - Defra Identity end_session_endpoint
 * @property {{ post_logout_redirect_uri: string, id_token_hint: string, state: string }} fields
 */
