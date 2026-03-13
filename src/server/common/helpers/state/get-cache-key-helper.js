import { getGrantCode } from '../grant-code.js'
import { BaseError } from '../../utils/errors/BaseError.js'

/**
 * Generates a cache key from a Hapi request by extracting user, business, and grant identifiers.
 *
 * @param {import('@hapi/hapi').Request} request - The Hapi request object containing authentication credentials and route parameters.
 * @returns {{ sbi: string, grantCode: string }} An object containing identifiers to be used as a cache key.
 * @throws {Error} If authentication credentials, user ID, business relationship, or grant ID are missing or malformed.
 */
export const getCacheKey = (request) => {
  const credentials = request.auth?.credentials

  if (!credentials) {
    throw BaseError.wrap(new Error('Missing auth credentials'))
  }
  /** @type {object} */
  const { crn, organisationId: sbi } = credentials

  if (!crn) {
    throw BaseError.wrap(new Error('Missing CRN in credentials'))
  }

  if (!sbi) {
    throw BaseError.wrap(new Error('Missing SBI (organisationId) in credentials'))
  }

  const grantCode = getGrantCode(request)

  if (!grantCode) {
    throw BaseError.wrap(new Error('Missing grantCode'))
  }
  return { sbi, grantCode }
}

/**
 * Parses a session key into its components.
 *
 * @param {string} sessionKey - Colon-separated key (sbi:grantCode)
 * @returns {{ sbi: string, grantCode: string }} Parsed values
 * @throws {Error} If sessionKey is invalid or missing parts
 */
export function parseSessionKey(sessionKey) {
  if (!sessionKey || typeof sessionKey !== 'string') {
    throw BaseError.wrap(new Error('Invalid session key: must be a non-empty string'))
  }

  const [sbi, grantCode] = sessionKey.split(':')

  if (!sbi || !grantCode) {
    throw BaseError.wrap(new Error(`Invalid session key format: ${sessionKey}`))
  }

  return { sbi, grantCode }
}
