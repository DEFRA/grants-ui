import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

const outputLog = (request, message) => {
  log(LogCodes.AUTH.AUTH_DEBUG, {
    path: 'getCacheKey',
    isAuthenticated: request.auth?.isAuthenticated,
    strategy: request.auth?.strategy,
    mode: request.auth?.mode,
    hasCredentials: false,
    queryParams: {},
    authError: `${message} ${JSON.stringify(request.auth?.credentials) || 'none'}`,
    errorDetails: {}
  })
}

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
    outputLog(request, 'Missing auth credentials')
    throw new Error('Missing auth credentials')
  }
  const { crn, organisationId: sbi } = credentials

  if (!crn) {
    outputLog(request, 'Missing CRN in credentials')
    throw new Error('Missing CRN in credentials')
  }

  if (!sbi) {
    outputLog(request, 'Missing SBI (organisationId) in credentials')
    throw new Error(`'Missing SBI (organisationId) in credentials`)
  }

  const grantCode = request.params?.slug
  if (!grantCode) {
    outputLog(request, 'Missing grantCode')
    throw new Error('Missing grantCode')
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
    throw new Error('Invalid session key: must be a non-empty string')
  }

  const [sbi, grantCode] = sessionKey.split(':')

  if (!sbi || !grantCode) {
    throw new Error(`Invalid session key format: ${sessionKey}`)
  }

  return { sbi, grantCode }
}
