import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

export const getCacheKey = (request) => {
  const credentials = request.auth?.credentials

  if (!credentials) {
    log(LogCodes.AUTH.AUTH_DEBUG, {
      path: 'getCacheKey',
      isAuthenticated: request.auth?.isAuthenticated,
      strategy: request.auth?.strategy,
      mode: request.auth?.mode,
      hasCredentials: !!credentials,
      hasToken: false,
      hasProfile: false,
      userAgent: 'server',
      referer: 'none',
      queryParams: {},
      authError: `Missing auth credentials ${JSON.stringify(credentials) || 'none'}`,
      errorDetails: {
        message: `Missing auth credentials ${JSON.stringify(credentials) || 'none'}`,
        stack: null
      }
    })
    throw new Error('1Missing auth credentials')
  }
  const { id: userId, relationships } = credentials

  if (!userId) {
    log(LogCodes.AUTH.AUTH_DEBUG, {
      path: 'getCacheKey',
      isAuthenticated: request.auth?.isAuthenticated,
      strategy: request.auth?.strategy,
      mode: request.auth?.mode,
      hasCredentials: !!credentials,
      hasToken: false,
      hasProfile: false,
      userAgent: 'server',
      referer: 'none',
      queryParams: {},
      authError: `Missing user ID in credentials ${JSON.stringify(credentials) || 'none'}`,
      errorDetails: {
        message: `Missing user ID in credentials ${JSON.stringify(credentials) || 'none'}`,
        stack: null
      }
    })
    throw new Error('2Missing user ID in credentials')
  }

  // Support single-business users for now
  const businessId = (Array.isArray(relationships) && relationships[0]?.split(':')[1]) || null
  if (!businessId) {
    log(LogCodes.AUTH.AUTH_DEBUG, {
      path: 'getCacheKey',
      isAuthenticated: request.auth?.isAuthenticated,
      strategy: request.auth?.strategy,
      mode: request.auth?.mode,
      hasCredentials: !!credentials,
      hasToken: false,
      hasProfile: false,
      userAgent: 'server',
      referer: 'none',
      queryParams: {},
      authError: `Missing or malformed business relationship in credentials ${JSON.stringify(credentials) || 'none'}`,
      errorDetails: {
        message: `Missing or malformed business relationship in credentials ${JSON.stringify(credentials) || 'none'}`,
        stack: null
      }
    })
    throw new Error(`3Missing or malformed business relationship in credentials: ${JSON.stringify(relationships)}`)
  }

  const grantId = request.params?.slug
  if (!grantId) {
    log(LogCodes.AUTH.AUTH_DEBUG, {
      path: 'getCacheKey',
      isAuthenticated: request.auth?.isAuthenticated,
      strategy: request.auth?.strategy,
      mode: request.auth?.mode,
      hasCredentials: !!credentials,
      hasToken: false,
      hasProfile: false,
      userAgent: 'server',
      referer: 'none',
      queryParams: {},
      authError: `Missing grantId from params ${request.params}`,
      errorDetails: {
        message: `Missing grantId from params ${request.params}`,
        stack: null
      }
    })
    throw new Error('4Missing grantId')
  }
  return { userId, businessId, grantId }
}
