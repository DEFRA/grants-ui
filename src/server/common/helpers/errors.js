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
    const isBellError =
      response?.message?.includes('bell') ||
      response?.message?.includes('Bell') ||
      response?.message?.includes('oauth') ||
      response?.message?.includes('OAuth')

    // Log authentication-related errors with detailed information
    if (isAuthError && !alreadyLogged) {
      log(LogCodes.AUTH.SIGN_IN_FAILURE, {
        userId: request.auth?.credentials?.contactId || 'unknown',
        error: response?.message || 'Authentication error',
        step: 'auth_flow_error',
        authContext: {
          path: request.path,
          isAuthenticated: request.auth?.isAuthenticated,
          strategy: request.auth?.strategy,
          mode: request.auth?.mode,
          hasCredentials: !!request.auth?.credentials,
          hasToken: !!request.auth?.credentials?.token,
          hasProfile: !!request.auth?.credentials?.profile,
          errorName: response?.name,
          errorOutput: response?.output?.payload?.message,
          userAgent: request.headers?.['user-agent'] || 'unknown',
          referer: request.headers?.referer || 'none',
          queryParams: request.query || {},
          isBellError,
          statusCode
        }
      })
    } else if (isBellError && !alreadyLogged) {
      // Log Bell-specific errors that might not be on auth paths
      log(LogCodes.AUTH.SIGN_IN_FAILURE, {
        userId: request.auth?.credentials?.contactId || 'unknown',
        error: response?.message || 'Bell/OAuth error',
        step: 'bell_oauth_error',
        authContext: {
          path: request.path,
          isAuthenticated: request.auth?.isAuthenticated,
          strategy: request.auth?.strategy,
          mode: request.auth?.mode,
          hasCredentials: !!request.auth?.credentials,
          errorName: response?.name,
          errorOutput: response?.output?.payload?.message,
          userAgent: request.headers?.['user-agent'] || 'unknown',
          referer: request.headers?.referer || 'none',
          queryParams: request.query || {},
          statusCode
        }
      })
    } else if (!isAuthError && !isBellError && !alreadyLogged) {
      // Log system errors (only if not already logged)
      log(LogCodes.SYSTEM.SERVER_ERROR, {
        error: response?.message || 'Internal server error',
        statusCode,
        path: request.path,
        method: request.method,
        stack: response?.stack
      })
    }

    // Always log detailed error information for debugging
    log(LogCodes.AUTH.AUTH_DEBUG, {
      path: request.path,
      isAuthenticated: 'error_handler',
      strategy: 'error_handler',
      mode: 'error_processing',
      hasCredentials: false,
      hasToken: false,
      hasProfile: false,
      userAgent: request.headers?.['user-agent'] || 'unknown',
      referer: request.headers?.referer || 'none',
      queryParams: request.query || {},
      authError: 'none',
      errorDetails: {
        statusCode,
        errorMessage,
        responseMessage: response?.message,
        responseName: response?.name,
        responseOutput: response?.output?.payload?.message,
        isAuthError,
        isBellError,
        alreadyLogged,
        errorStack: response?.stack
      }
    })

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
