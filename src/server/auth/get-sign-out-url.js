import { config } from '~/src/config/config.js'
import { getOidcConfig } from './get-oidc-config.js'
import { createState } from './state.js'

async function getSignOutUrl(request, token) {
  const { end_session_endpoint: url } = await getOidcConfig()

  // To prevent CSRF attacks, the state parameter should be passed during redirection
  // It should be verified when the user is redirected back to the application
  // The `createState` function generates a unique state value and stores it in the session
  const state = createState(request)

  const query = [
    `post_logout_redirect_uri=${config.get('defraId.signOutRedirectUrl')}`,
    `id_token_hint=${token}`,
    `state=${state}`
  ].join('&')
  return encodeURI(`${url}?${query}`)
}

export { getSignOutUrl }
