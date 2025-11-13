import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { badRequest, unauthorized, forbidden, notFound, conflict, badData, tooManyRequests, internal } from '@hapi/boom'
import { config } from '~/src/config/config.js'

const UNKNOWN_USER = 'unknown'

export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  BAD_DATA: 422,
  TOO_MANY_REQUESTS: 429
}

/**
 * Creates a standard boom error from status code and message
 * @param {number} statusCode
 * @param {string} message
 */
export function createBoomError(statusCode, message) {
  switch (statusCode) {
    case HTTP_STATUS.BAD_REQUEST:
      return badRequest(message)
    case HTTP_STATUS.UNAUTHORIZED:
      return unauthorized(message)
    case HTTP_STATUS.FORBIDDEN:
      return forbidden(message)
    case HTTP_STATUS.NOT_FOUND:
      return notFound(message)
    case HTTP_STATUS.CONFLICT:
      return conflict(message)
    case HTTP_STATUS.BAD_DATA:
      return badData(message)
    case HTTP_STATUS.TOO_MANY_REQUESTS:
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
 * @param { AnyRequest } request
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
  log(
    LogCodes.AUTH.SIGN_IN_FAILURE,
    {
      userId: request.auth?.credentials?.contactId || UNKNOWN_USER,
      error: response?.message || 'Authentication error',
      step: 'auth_flow_error',
      authContext: buildAuthContext(request, response, errorContext)
    },
    request
  )
}

function logBellError(request, response, errorContext) {
  log(
    LogCodes.AUTH.SIGN_IN_FAILURE,
    {
      userId: request.auth?.credentials?.contactId || UNKNOWN_USER,
      error: response?.message || 'Bell/OAuth error',
      step: 'bell_oauth_error',
      authContext: buildAuthContext(request, response, errorContext)
    },
    request
  )
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
  log(
    LogCodes.SYSTEM.SERVER_ERROR,
    {
      error: response?.message || 'Internal server error',
      statusCode,
      path: request.path,
      method: request.method,
      stack: response?.stack
    },
    request
  )
}

function logDebugInformation(request, response, statusCode, errorContext) {
  const errorMessage = statusCodeMessage(statusCode)

  log(
    LogCodes.AUTH.AUTH_DEBUG,
    {
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
    },
    request
  )
}

function handleClientErrors(request, response, statusCode) {
  const errorMessage = statusCodeMessage(statusCode)

  // Special handling for 404s with detailed logging
  if (statusCode === statusCodes.notFound) {
    handle404WithContext(request, response)
  }

  // Keep existing general logging
  log(
    LogCodes.SYSTEM.SERVER_ERROR,
    {
      error: response?.message || errorMessage,
      statusCode,
      path: request.path,
      method: request.method
    },
    request
  )
}

/**
 * Determine the reason for resource error based on error message
 * @param {string} errorMsg - Error message from response
 * @returns {string} Reason code
 */
function determineErrorReason(errorMsg) {
  const isDisabledError = errorMsg.includes('not enabled') || errorMsg.includes('not available')
  return isDisabledError ? 'disabled_in_production' : 'not_found'
}

/**
 * Try to parse path as a form resource
 * @param {string} path - Request path
 * @param {string} errorMsg - Error message
 * @returns {{type: string, identifier: string, reason: string} | null}
 */
function tryParseForm(path, errorMsg) {
  const formRegex = /^\/([^/]+)\//
  const formMatch = formRegex.exec(path)
  if (formMatch && errorMsg.includes('Form')) {
    return {
      type: 'form',
      identifier: formMatch[1],
      reason: determineErrorReason(errorMsg)
    }
  }
  return null
}

/**
 * Try to parse path as a tasklist resource
 * @param {string} path - Request path
 * @param {string} errorMsg - Error message
 * @returns {{type: string, identifier: string, reason: string} | null}
 */
function tryParseTasklist(path, errorMsg) {
  const tasklistRegex = /^\/tasklist\/([^/]+)/
  const tasklistMatch = tasklistRegex.exec(path)
  if (tasklistMatch || errorMsg.includes('Tasklist')) {
    return {
      type: 'tasklist',
      identifier: tasklistMatch?.[1] || 'unknown',
      reason: errorMsg.includes('not available') ? 'disabled_in_production' : 'not_found'
    }
  }
  return null
}

/**
 * Parse resource path to determine type and context
 * @param {string} path - Request path
 * @param {object} response - Response object
 * @returns {{type: string, identifier: string, reason: string}}
 */
function parseResourcePath(path, response) {
  const errorMsg = response?.message || ''

  const formResource = tryParseForm(path, errorMsg)
  if (formResource) {
    return formResource
  }

  const tasklistResource = tryParseTasklist(path, errorMsg)
  if (tasklistResource) {
    return tasklistResource
  }

  return { type: 'page', identifier: path, reason: 'not_found' }
}

/**
 * Handle 404 errors with detailed context logging
 * @param {AnyRequest} request
 * @param {object} response
 */
function handle404WithContext(request, response) {
  const path = request.path || 'unknown'
  const userId = request.auth?.credentials?.contactId || 'anonymous'
  const sbi = request.auth?.credentials?.sbi || 'unknown'
  const referer = request.headers?.referer || 'none'
  const userAgent = request.headers?.['user-agent'] || 'unknown'
  const environment = config.get('cdpEnvironment')

  // Parse the path to determine resource type
  const resourceInfo = parseResourcePath(path, response)

  switch (resourceInfo.type) {
    case 'form':
      log(
        LogCodes.RESOURCE_NOT_FOUND.FORM_NOT_FOUND,
        {
          slug: resourceInfo.identifier,
          userId,
          sbi,
          referer,
          userAgent,
          reason: resourceInfo.reason,
          environment
        },
        request
      )
      break

    case 'tasklist':
      log(
        LogCodes.RESOURCE_NOT_FOUND.TASKLIST_NOT_FOUND,
        {
          tasklistId: resourceInfo.identifier,
          userId,
          sbi,
          referer,
          userAgent,
          reason: resourceInfo.reason,
          environment
        },
        request
      )
      break

    default:
      log(
        LogCodes.RESOURCE_NOT_FOUND.PAGE_NOT_FOUND,
        {
          path,
          userId,
          sbi,
          referer,
          userAgent
        },
        request
      )
  }
}

function renderErrorView(h, errorMessage, statusCode) {
  if (statusCode === statusCodes.notFound) {
    return h
      .view('page-not-found', {
        pageTitle: errorMessage
      })
      .code(statusCode)
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
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseToolkit } from '@hapi/hapi'
 */
