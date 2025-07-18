import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * @param {number} statusCode
 */
function statusCodeMessage(statusCode) {
  switch (statusCode) {
    case statusCodes.notFound:
      return 'Page not found'
    case statusCodes.forbidden:
      return 'Forbidden'
    case statusCodes.unauthorized:
      return 'Unauthorized'
    case statusCodes.badRequest:
      return 'Bad Request'
    default:
      return 'Something went wrong'
  }
}

/**
 * @param { Request } request
 * @param { ResponseToolkit } h
 */
export function catchAll(request, h) {
  const successCode = 200
  const { response } = request

  if (!response?.isBoom) {
    return h.response(response).code(response?.statusCode ?? successCode)
  }

  const statusCode = response.output.statusCode
  const errorMessage = statusCodeMessage(statusCode)

  if (statusCode >= statusCodes.internalServerError) {
    // Use structured logging for server errors
    const isAuthError = request.path?.startsWith('/auth')
    const alreadyLogged = response?.alreadyLogged

    if (isAuthError && !alreadyLogged) {
      // Log authentication-related errors with specific log codes (only if not already logged)
      log(LogCodes.AUTH.SIGN_IN_FAILURE, {
        userId: request.auth?.credentials?.contactId || 'unknown',
        error: response?.message || 'Authentication error',
        step: 'auth_flow_error'
      })
    } else if (!isAuthError && !alreadyLogged) {
      // Log system errors (only if not already logged)
      log(LogCodes.SYSTEM.SERVER_ERROR, {
        error: response?.message || 'Internal server error',
        statusCode,
        path: request.path,
        method: request.method,
        stack: response?.stack
      })
    }
    // If already logged, skip logging to avoid duplicates
  } else if (statusCode >= statusCodes.badRequest) {
    // Log 4xx errors with structured logging for debugging
    log(LogCodes.SYSTEM.SERVER_ERROR, {
      error: response?.message || errorMessage,
      statusCode,
      path: request.path,
      method: request.method
    })
  }

  return h
    .view('error/index', {
      pageTitle: errorMessage,
      heading: statusCode,
      message: errorMessage
    })
    .code(statusCode)
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 */
