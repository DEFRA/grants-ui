import Jwt from '@hapi/jwt'
import Wreck from '@hapi/wreck'
import { getOidcConfig } from './get-oidc-config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { defineCachedMethod, UNRETRIED_GENERATE_TIMEOUT_MS } from '~/src/server/common/helpers/cache/cached-method.js'
import { createPublicKey } from 'node:crypto'

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000

/**
 * Verify a Defra Identity access token against the OIDC JWKS endpoint.
 * @param {string} token
 * @returns {Promise<void>}
 */
async function verifyToken(token) {
  try {
    const decoded = Jwt.token.decode(token)
    // @hapi/jwt's header type omits `kid`, though Defra ID tokens carry it
    const { kid } = /** @type {{ kid?: string }} */ (decoded.decoded.header)
    const pem = convertJwkToPem(await findSigningKey(kid))
    verifyTokenSignature(decoded, pem)
    logSuccessfulVerification(decoded)
  } catch (error) {
    handleVerificationError(/** @type {ErrorResponse} */ (error), token)
    throw error
  }
}

/**
 * @returns {Promise<Record<string, unknown>[]>} the `keys` array from the JWKS document
 */
async function fetchJwksKeys() {
  const { jwks_uri: uri } = await getOidcConfig()
  const { payload } = await Wreck.get(uri, { json: true })
  const { keys } = payload

  if (!keys || keys.length === 0) {
    log(LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE, {
      userId: 'unknown',
      errorMessage: 'No keys found in JWKS response',
      step: 'jwks_fetch'
    })
    throw new Error('No keys found in JWKS response')
  }

  return keys
}

const jwks = defineCachedMethod('auth.jwks', fetchJwksKeys, {
  expiresIn: JWKS_CACHE_TTL_MS,
  generateTimeout: UNRETRIED_GENERATE_TIMEOUT_MS,
  generateKey: () => 'jwks'
})

export const jwksCachePlugin = {
  plugin: {
    name: 'jwks-cache',
    register(/** @type {Server} */ server) {
      jwks.register(server)
    }
  }
}

/**
 * @param {string | undefined} kid
 * @returns {Promise<Record<string, unknown>>}
 */
async function findSigningKey(kid) {
  const cachedKey = (await jwks.call()).find((k) => k.kid === kid)
  if (cachedKey) {
    return cachedKey
  }
  await jwks.drop()
  return selectSigningKey(await jwks.call(), kid)
}

/**
 * Pick the key that signed the token. During a key rotation the signing key
 * may not be first in the set, so match on the token header's `kid`.
 * @param {Record<string, unknown>[]} keys - raw JWKS `keys` array
 * @param {string | undefined} kid - key ID from the token header
 * @returns {Record<string, unknown>}
 */
function selectSigningKey(keys, kid) {
  const key = keys.find((k) => k.kid === kid)
  if (!key) {
    throw new Error(`No JWK matches token kid "${kid}"`)
  }
  return key
}

/**
 * @param {Record<string, unknown>} key - a single JWK from the JWKS `keys` array
 * @returns {string}
 */
function convertJwkToPem(key) {
  return createPublicKey({ key, format: 'jwk' }).export({ format: 'pem', type: 'spki' })
}

/**
 * @param {import('@hapi/jwt').HapiJwt.Artifacts} decoded
 * @param {string} pem
 * @returns {void}
 */
function verifyTokenSignature(decoded, pem) {
  Jwt.token.verify(decoded, { key: pem, algorithm: 'RS256' })
}

/**
 * @param {DecodedToken} decoded - JWT artifacts (defensively read in two shapes)
 * @returns {void}
 */
function logSuccessfulVerification(decoded) {
  const tokenPayload = decoded.decoded?.payload || decoded['payload'] || {}
  const userId = tokenPayload.contactId || 'unknown'

  log(LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS, {
    userId,
    organisationId: tokenPayload.currentRelationshipId || 'unknown',
    step: 'token_verification_complete'
  })
}

/**
 * @param {ErrorResponse} error
 * @param {string} token
 */
function handleVerificationError(error, token) {
  let userId = 'unknown'
  let step = 'unknown'

  try {
    /** @type {DecodedToken} */
    const decoded = Jwt.token.decode(token)
    const tokenPayload = decoded.decoded?.payload || decoded['payload'] || {}
    userId = tokenPayload.contactId || 'unknown'
  } catch {
    step = 'token_decode_failed'
  }

  step = determineVerificationStep(error, step)

  log(LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE, {
    userId,
    errorMessage: error.message,
    step,
    tokenPresent: !!token
  })

  error.alreadyLogged = true
}

/**
 * @param {Error} error
 * @param {string} defaultStep
 * @returns {string}
 */
function determineVerificationStep(error, defaultStep) {
  if (error.message.includes('JWKS')) {
    return 'jwks_fetch'
  } else if (error.message.includes('JWK')) {
    return 'jwk_conversion'
  } else if (error.message.includes('decode')) {
    return 'token_decode'
  } else if (error.message.includes('verify')) {
    return 'signature_verification'
  } else {
    return defaultStep
  }
}

export { verifyToken }

/**
 * @import { Server } from '@hapi/hapi'
 *
 * @typedef {Error & { alreadyLogged?: boolean }} ErrorResponse
 *
 * @typedef {{ decoded?: { payload?: any }, payload?: any }} DecodedToken
 */
