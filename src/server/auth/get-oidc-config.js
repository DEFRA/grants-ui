import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'

async function getOidcConfig(url = config.get('defraId.wellKnownUrl'), options = { json: true }) {
  // Fetch the OpenID Connect configuration from the well-known endpoint
  // Contains the URLs for authorisation, sign out, token and public keys in JSON format
  const { payload } = await Wreck.get(url, { ...options })

  return payload
}

export { getOidcConfig }
