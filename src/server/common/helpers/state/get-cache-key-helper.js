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

export const getCacheKey = (request) => {
  const credentials = request.auth?.credentials

  if (!credentials) {
    outputLog(request, 'Missing auth credentials')
    throw new Error('1Missing auth credentials')
  }
  const { id: userId, relationships } = credentials

  if (!userId) {
    outputLog(request, 'Missing user ID in credentials')
    throw new Error('2Missing user ID in credentials')
  }

  // Support single-business users for now
  const businessId = (Array.isArray(relationships) && relationships[0]?.split(':')[1]) || null
  if (!businessId) {
    outputLog(request, 'Missing or malformed business relationship in credentials')
    throw new Error(`3Missing or malformed business relationship in credentials: ${JSON.stringify(relationships)}`)
  }

  const grantId = request.params?.slug
  if (!grantId) {
    outputLog(request, 'Missing grantId')
    throw new Error('4Missing grantId')
  }
  return { userId, businessId, grantId }
}
