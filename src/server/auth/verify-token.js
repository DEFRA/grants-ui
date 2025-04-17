import Jwt from '@hapi/jwt'
import Wreck from '@hapi/wreck'
import jose from 'node-jose'
import { getOidcConfig } from './get-oidc-config.js'

async function verifyToken(token) {
  const { jwks_uri: uri } = await getOidcConfig()

  const { payload } = await Wreck.get(uri, {
    json: true
  })
  const { keys } = payload

  // Convert the JWK to a PEM-encoded public key using node-jose
  const key = await jose.JWK.asKey(keys[0])

  // Check that the token is signed with the appropriate key by decoding it and verifying the signature using the public key
  const decoded = Jwt.token.decode(token)
  Jwt.token.verify(decoded, { key: key.toPEM(), algorithm: 'RS256' })
}

export { verifyToken }
