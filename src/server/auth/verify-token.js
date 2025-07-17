import Jwt from '@hapi/jwt'
import Wreck from '@hapi/wreck'
import jose from 'node-jose'
import { getOidcConfig } from './get-oidc-config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

async function verifyToken(token) {
  try {
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

    // Extract user info from token for logging
    const tokenPayload = decoded.decoded?.payload || decoded.payload || {}
    const userId = tokenPayload.contactId || 'unknown'
    log(LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS, {
      userId,
      organisationId: tokenPayload.currentRelationshipId || 'unknown'
    })
  } catch (error) {
    // Try to extract user info from token for logging, fallback to unknown
    let userId = 'unknown'
    try {
      const decoded = Jwt.token.decode(token)
      const tokenPayload = decoded.decoded?.payload || decoded.payload || {}
      userId = tokenPayload.contactId || 'unknown'
    } catch {
      // Token is malformed, keep userId as unknown
    }

    log(LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE, {
      userId,
      error: error.message
    })
    throw error
  }
}

export { verifyToken }
