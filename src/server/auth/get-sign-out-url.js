import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { createState } from '~/src/server/auth/state.js'

/**
 * Build the Defra Identity end-session URL for the current user.
 * @param {AnyRequest} request
 * @param {string} token
 * @returns {Promise<string>}
 */
async function getSignOutUrl(request, token) {
  const { end_session_endpoint: url } = await getOidcConfig()

  /** @type {string} */
  const signOutRedirectUrl = config.get('defraId.signOutRedirectUrl')

  // To prevent CSRF attacks, the state parameter should be passed during redirection
  // It should be verified when the user is redirected back to the application
  // The `createState` function generates a unique state value and stores it in the session
  const state = createState(request)

  const query = [`post_logout_redirect_uri=${signOutRedirectUrl}`, `id_token_hint=${token}`, `state=${state}`].join('&')
  return encodeURI(`${url}?${query}`)
}

export { getSignOutUrl }

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
