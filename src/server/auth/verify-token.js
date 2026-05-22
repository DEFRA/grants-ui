import Jwt from '@hapi/jwt'
import Wreck from '@hapi/wreck'
import { getOidcConfig } from './get-oidc-config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { createPublicKey } from 'node:crypto'

/**
 * Verify a Defra Identity access token against the OIDC JWKS endpoint.
 * @param {string} token
 * @returns {Promise<void>}
 */
async function verifyToken(token) {
  try {
    const keys = await fetchJwksKeys()
    const pem = convertJwkToPem(keys)
    const decoded = verifyTokenSignature(token, pem)
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

/**
 * @param {Record<string, unknown>[]} keys - raw JWKS `keys` array
 * @returns {string}
 */
function convertJwkToPem(keys) {
  return createPublicKey({ key: keys[0], format: 'jwk' }).export({ format: 'pem', type: 'spki' })
}

/**
 * @param {string} token
 * @param {string} pem
 * @returns {import('@hapi/jwt').HapiJwt.Artifacts}
 */
function verifyTokenSignature(token, pem) {
  const decoded = Jwt.token.decode(token)
  Jwt.token.verify(decoded, { key: pem, algorithm: 'RS256' })
  return decoded
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
 * @typedef {Error & { alreadyLogged?: boolean }} ErrorResponse
 *
 * @typedef {{ decoded?: { payload?: any }, payload?: any }} DecodedToken
 */
