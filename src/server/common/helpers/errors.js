import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { badRequest, unauthorized, forbidden, notFound, conflict, badData, tooManyRequests, internal } from '@hapi/boom'

const UNKNOWN_USER = 'unknown'

/**
 * Creates a standard boom error from status code and message
 * @param {number} statusCode
 * @param {string} message
 */
export function createBoomError(statusCode, message) {
  switch (statusCode) {
    case 400:
      return badRequest(message)
    case 401:
      return unauthorized(message)
    case 403:
      return forbidden(message)
    case 404:
      return notFound(message)
    case 409:
      return conflict(message)
    case 422:
      return badData(message)
    case 429:
      return tooManyRequests(message)
    default:
      return internal(message)
  }
}

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
  const { response } = request

  if (!response?.isBoom) {
    return h.response(response).code(response?.statusCode ?? statusCodes.ok)
  }

  const statusCode = response.output.statusCode

  // Handle redirects properly
  if (statusCode === statusCodes.redirect && response.output.headers.location) {
    return h.redirect(response.output.headers.location)
  }

  const errorMessage = statusCodeMessage(statusCode)

  handleErrorLogging(request, response, statusCode)

  return renderErrorView(h, errorMessage, statusCode)
}

function handleErrorLogging(request, response, statusCode) {
  if (statusCode >= statusCodes.internalServerError) {
    handleServerErrors(request, response, statusCode)
  } else if (statusCode >= statusCodes.badRequest) {
    handleClientErrors(request, response, statusCode)
  } else {
    // No logging needed for success codes
  }
}

function handleServerErrors(request, response, statusCode) {
  const errorContext = analyzeError(request, response)

  if (errorContext.isAuthError && !errorContext.alreadyLogged) {
    logAuthError(request, response, errorContext)
  } else if (errorContext.isBellError && !errorContext.alreadyLogged) {
    logBellError(request, response, errorContext)
  } else if (!errorContext.isAuthError && !errorContext.isBellError && !errorContext.alreadyLogged) {
    logSystemError(request, response, statusCode)
  } else {
    // Error already logged, skip to avoid duplicates
  }

  logDebugInformation(request, response, statusCode, errorContext)
}

function analyzeError(request, response) {
  return {
    isAuthError: request.path?.startsWith('/auth'),
    alreadyLogged: response?.alreadyLogged,
    isBellError: isBellRelatedError(response)
  }
}

function isBellRelatedError(response) {
  return (
    response?.message?.includes('bell') ||
    response?.message?.includes('Bell') ||
    response?.message?.includes('oauth') ||
    response?.message?.includes('OAuth')
  )
}

function logAuthError(request, response, errorContext) {
  log(LogCodes.AUTH.SIGN_IN_FAILURE, {
    userId: request.auth?.credentials?.contactId || UNKNOWN_USER,
    error: response?.message || 'Authentication error',
    step: 'auth_flow_error',
    authContext: buildAuthContext(request, response, errorContext)
  })
}

function logBellError(request, response, errorContext) {
  log(LogCodes.AUTH.SIGN_IN_FAILURE, {
    userId: request.auth?.credentials?.contactId || UNKNOWN_USER,
    error: response?.message || 'Bell/OAuth error',
    step: 'bell_oauth_error',
    authContext: buildAuthContext(request, response, errorContext)
  })
}

function buildAuthContext(request, response, errorContext) {
  return {
    path: request.path,
    isAuthenticated: request.auth?.isAuthenticated,
    strategy: request.auth?.strategy,
    mode: request.auth?.mode,
    hasCredentials: !!request.auth?.credentials,
    hasToken: !!request.auth?.credentials?.token,
    hasProfile: !!request.auth?.credentials?.profile,
    errorName: response?.name,
    errorOutput: response?.output?.payload?.message,
    userAgent: request.headers?.['user-agent'] || UNKNOWN_USER,
    referer: request.headers?.referer || 'none',
    queryParams: request.query || {},
    isBellError: errorContext.isBellError,
    statusCode: response.output.statusCode
  }
}

function logSystemError(request, response, statusCode) {
  log(LogCodes.SYSTEM.SERVER_ERROR, {
    error: response?.message || 'Internal server error',
    statusCode,
    path: request.path,
    method: request.method,
    stack: response?.stack
  })
}

function logDebugInformation(request, response, statusCode, errorContext) {
  const errorMessage = statusCodeMessage(statusCode)

  log(LogCodes.AUTH.AUTH_DEBUG, {
    path: request.path,
    isAuthenticated: 'error_handler',
    strategy: 'error_handler',
    mode: 'error_processing',
    hasCredentials: false,
    hasToken: false,
    hasProfile: false,
    userAgent: request.headers?.['user-agent'] || UNKNOWN_USER,
    referer: request.headers?.referer || 'none',
    queryParams: request.query || {},
    authError: 'none',
    errorDetails: {
      statusCode,
      errorMessage,
      responseMessage: response?.message,
      responseName: response?.name,
      responseOutput: response?.output?.payload?.message,
      isAuthError: errorContext.isAuthError,
      isBellError: errorContext.isBellError,
      alreadyLogged: errorContext.alreadyLogged,
      errorStack: response?.stack
    }
  })
}

function handleClientErrors(request, response, statusCode) {
  const errorMessage = statusCodeMessage(statusCode)

  log(LogCodes.SYSTEM.SERVER_ERROR, {
    error: response?.message || errorMessage,
    statusCode,
    path: request.path,
    method: request.method
  })
}

function renderErrorView(h, errorMessage, statusCode) {
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
