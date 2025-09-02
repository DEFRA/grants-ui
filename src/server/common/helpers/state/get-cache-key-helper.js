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
 * @returns {{ userId: string, businessId: string, grantId: string }} An object containing identifiers to be used as a cache key.
 * @throws {Error} If authentication credentials, user ID, business relationship, or grant ID are missing or malformed.
 */
export const getCacheKey = (request) => {
  const credentials = request.auth?.credentials

  if (!credentials) {
    outputLog(request, 'Missing auth credentials')
    throw new Error('Missing auth credentials')
  }
  const { crn: userId } = credentials

  if (!userId) {
    outputLog(request, 'Missing user ID in credentials')
    throw new Error('Missing user ID in credentials')
  }

  const organisationId = credentials.organisationId
  if (!organisationId) {
    outputLog(request, 'Missing organisation ID in credentials')
    throw new Error(`'Missing organisation ID in credentials`)
  }

  const grantId = request.params?.slug
  if (!grantId) {
    outputLog(request, 'Missing grantId')
    throw new Error('Missing grantId')
  }
  return { userId, organisationId, grantId }
}

/**
 * Parses a session key into its components.
 *
 * @param {string} sessionKey - Colon-separated key (userId:businessId:grantId)
 * @returns {{ userId: string, organisationId: string, grantId: string }} Parsed values
 * @throws {Error} If sessionKey is invalid or missing parts
 */
export function parseSessionKey(sessionKey) {
  if (!sessionKey || typeof sessionKey !== 'string') {
    throw new Error('Invalid session key: must be a non-empty string')
  }

  const [userId, organisationId, grantId] = sessionKey.split(':')

  if (!userId || !organisationId || !grantId) {
    throw new Error(`Invalid session key format: ${sessionKey}`)
  }

  return { userId, organisationId, grantId }
}
