import Jwt from '@hapi/jwt'
import Wreck from '@hapi/wreck'
import jose from 'node-jose'
import { getOidcConfig } from './get-oidc-config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * Verify a Defra Identity access token against the OIDC JWKS endpoint.
 * @param {string} token
 * @returns {Promise<void>}
 */
async function verifyToken(token) {
  try {
    const keys = await fetchJwksKeys()
    const key = await convertJwkToPem(keys)
    const decoded = verifyTokenSignature(token, key)
    logSuccessfulVerification(decoded)
  } catch (error) {
    handleVerificationError(/** @type {ErrorResponse} */ (error), token)
    throw error
  }
}

/**
 * @returns {Promise<unknown[]>} the `keys` array from the JWKS document
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

/**
 * @param {unknown[]} keys - raw JWKS `keys` array
 * @returns {Promise<JoseKey>}
 */
function convertJwkToPem(keys) {
  return jose.JWK.asKey(keys[0])
}

/**
 * @param {string} token
 * @param {JoseKey} key
 * @returns {import('@hapi/jwt').HapiJwt.Artifacts}
 */
function verifyTokenSignature(token, key) {
  const decoded = Jwt.token.decode(token)
  Jwt.token.verify(decoded, { key: key.toPEM(), algorithm: 'RS256' })
  return decoded
}

/**
 * @param {any} decoded - JWT artifacts (defensively read in two shapes)
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
    /** @type {any} */
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
 * @typedef {{ toPEM: () => string }} JoseKey
 *
 * @typedef {Error & { alreadyLogged?: boolean }} ErrorResponse
 */
