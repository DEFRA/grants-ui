import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import {
  badData,
  badRequest,
  conflict,
  forbidden,
  internal,
  locked,
  notFound,
  tooManyRequests,
  unauthorized
} from '@hapi/boom'
import { config } from '~/src/config/config.js'
import { BaseError } from '~/src/server/common/utils/errors/BaseError.js'

const UNKNOWN_USER = 'unknown'
const SERVER_ERROR_RANGE_END = 600

export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  BAD_DATA: 422,
  LOCKED: 423,
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
    case HTTP_STATUS.LOCKED:
      return locked(message)
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
 * Reads the upstream HTTP status from a thrown error wrapped by Boom, so it can
 * be attached to the SERVER_ERROR log payload. When a downstream service
 * (e.g. grants-ui-backend) responds with 5xx, the call site throws an Error
 * with `code`/`status` set; `boomify` mutates that error in place to add Boom
 * fields without removing the original properties.
 * @param {ErrorResponse} response
 * @returns {number | null}
 */
function getUpstreamStatus(response) {
  const candidate = response?.code ?? response?.status ?? null
  return typeof candidate === 'number' &&
    candidate >= statusCodes.internalServerError &&
    candidate < SERVER_ERROR_RANGE_END
    ? candidate
    : null
}

/**
 * @param { AnyRequest } request
 * @param { ResponseToolkit } h
 */
export function catchAll(request, h) {
  const { response } = request

  if (!response?.isBoom && !(response instanceof BaseError)) {
    return h.response(response).code(response?.statusCode ?? statusCodes.ok)
  }

  let statusCode
  let upstreamStatus = null

  if (response instanceof BaseError) {
    const rootErrors = BaseError.findRootErrors(response)
    for (const error of rootErrors) {
      error.log(request)
    }
    statusCode = response.details.status || statusCodes.internalServerError
  } else {
    statusCode = response.output.statusCode || statusCodes.internalServerError
    upstreamStatus = getUpstreamStatus(response)
    handleErrorLogging(request, response, statusCode, upstreamStatus)
  }

  // Handle redirects properly
  if (statusCode === statusCodes.redirect && response.output.headers.location) {
    return h.redirect(response.output.headers.location)
  }

  return renderErrorView(h, statusCode)
}

/**
 * @param {AnyRequest} request
 * @param {ErrorResponse} response
 * @param {number} statusCode
 * @param {number | null} [upstreamStatus]
 */
function handleErrorLogging(request, response, statusCode, upstreamStatus = null) {
  if (statusCode >= statusCodes.internalServerError) {
    handleServerErrors(request, response, statusCode, upstreamStatus)
  } else if (statusCode >= statusCodes.badRequest) {
    handleClientErrors(request, response, statusCode)
  } else {
    // No logging needed for success codes
  }
}

/**
 * @param {AnyRequest} request
 * @param {ErrorResponse} response
 * @param {number} statusCode
 * @param {number | null} [upstreamStatus]
 */
function handleServerErrors(request, response, statusCode, upstreamStatus = null) {
  const errorContext = analyzeError(request, response)

  if (errorContext.isAuthError && !errorContext.alreadyLogged) {
    logAuthError(request, response, errorContext)
  } else if (errorContext.isBellError && !errorContext.alreadyLogged) {
    logBellError(request, response, errorContext)
  } else if (!errorContext.isAuthError && !errorContext.isBellError && !errorContext.alreadyLogged) {
    logSystemError(request, response, statusCode, upstreamStatus)
  } else {
    // Error already logged, skip to avoid duplicates
  }

  logDebugInformation(request, response, statusCode, errorContext)
}

/**
 * @param {AnyRequest} request
 * @param {ErrorResponse} response
 * @returns {ErrorContext}
 */
function analyzeError(request, response) {
  return {
    isAuthError: request.path?.startsWith('/auth'),
    alreadyLogged: response?.alreadyLogged,
    isBellError: isBellRelatedError(response)
  }
}

/**
 * @param {ErrorResponse} response
 * @returns {boolean | undefined}
 */
function isBellRelatedError(response) {
  return (
    response?.message?.includes('bell') ||
    response?.message?.includes('Bell') ||
    response?.message?.includes('oauth') ||
    response?.message?.includes('OAuth')
  )
}

/**
 * @param {AnyRequest} request
 * @param {ErrorResponse} response
 * @param {ErrorContext} errorContext
 */
function logAuthError(request, response, errorContext) {
  log(
    LogCodes.AUTH.SIGN_IN_FAILURE,
    {
      userId: request.auth?.credentials?.contactId || UNKNOWN_USER,
      errorMessage: response?.message || 'Authentication error',
      step: 'auth_flow_error',
      authContext: buildAuthContext(request, response, errorContext)
    },
    request
  )
}

/**
 * @param {AnyRequest} request
 * @param {ErrorResponse} response
 * @param {ErrorContext} errorContext
 */
function logBellError(request, response, errorContext) {
  log(
    LogCodes.AUTH.SIGN_IN_FAILURE,
    {
      userId: request.auth?.credentials?.contactId || UNKNOWN_USER,
      errorMessage: response?.message || 'Bell/OAuth error',
      step: 'bell_oauth_error',
      authContext: buildAuthContext(request, response, errorContext)
    },
    request
  )
}

/**
 * @param {AnyRequest} request
 * @param {ErrorResponse} response
 * @param {ErrorContext} errorContext
 * @returns {Record<string, unknown>}
 */
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

/**
 * @param {AnyRequest} request
 * @param {ErrorResponse} response
 * @param {number} statusCode
 * @param {number | null} [upstreamStatus]
 */
function logSystemError(request, response, statusCode, upstreamStatus = null) {
  log(
    LogCodes.SYSTEM.SERVER_ERROR,
    {
      errorMessage: response?.message || 'Internal server error',
      statusCode,
      ...(upstreamStatus ? { upstreamStatus } : {}),
      path: request.path,
      method: request.method,
      stack: response?.stack
    },
    request
  )
}

/**
 * @param {AnyRequest} request
 * @param {ErrorResponse} response
 * @param {number} statusCode
 * @param {ErrorContext} errorContext
 */
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

/**
 * @param {AnyRequest} request
 * @param {ErrorResponse} response
 * @param {number} statusCode
 */
function handleClientErrors(request, response, statusCode) {
  if (statusCode === statusCodes.locked) {
    // Expected business condition – no system error log
    return
  }
  const errorMessage = statusCodeMessage(statusCode)

  // Special handling for 404s with detailed logging
  if (statusCode === statusCodes.notFound) {
    handle404WithContext(request, response)
  }

  // Keep existing general logging
  log(
    LogCodes.SYSTEM.SERVER_ERROR,
    {
      errorMessage: response?.message || errorMessage,
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
 * Parse resource path to determine type and context
 * @param {string} path - Request path
 * @param {ErrorResponse} response - Response object
 * @returns {{type: string, identifier: string, reason: string}}
 */
function parseResourcePath(path, response) {
  const errorMsg = response?.message || ''

  const formResource = tryParseForm(path, errorMsg)
  if (formResource) {
    return formResource
  }

  return { type: 'page', identifier: path, reason: 'not_found' }
}

/**
 * Handle 404 errors with detailed context logging
 * @param {AnyRequest} request
 * @param {ErrorResponse} response
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

  if (resourceInfo.type === 'form') {
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
  } else {
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

/**
 * @param {ResponseToolkit} h
 * @param {number} statusCode
 */
function renderErrorView(h, statusCode) {
  // SonarQube does not like this being set as the default for the switch, it's apparently a critical issue.
  let errorView

  switch (statusCode) {
    case statusCodes.badRequest:
      errorView = 'errors/400'
      break
    case statusCodes.unauthorized:
      errorView = 'errors/401'
      break
    case statusCodes.forbidden:
      errorView = 'errors/403'
      break
    case statusCodes.notFound:
      errorView = 'errors/404'
      break
    case statusCodes.locked:
      errorView = 'errors/423'
      break
    case statusCodes.tooManyRequests:
      errorView = 'errors/429'
      break
    case statusCodes.serviceUnavailable:
      errorView = 'errors/503'
      break
    default:
      errorView = 'errors/500'
  }

  return h
    .view(errorView, {
      supportEmail: h.request.app.model?.def?.metadata?.supportEmail ?? null
    })
    .code(statusCode)
}

/**
 * @typedef {Object} ErrorContext
 * @property {boolean} [isAuthError] - Whether the request is for an /auth path
 * @property {boolean} [alreadyLogged] - Whether the error has already been logged upstream
 * @property {boolean} [isBellError] - Whether the error originates from Bell/OAuth
 *
 * @typedef {Boom & { code?: number, status?: number, alreadyLogged?: boolean }} ErrorResponse
 *   A Boom error, optionally augmented with `code`/`status` (set by upstream
 *   client code before `boomify` wraps the Error) and `alreadyLogged` (set by
 *   handlers that have already emitted a log entry to suppress duplicates).
 *
 * @import { Boom } from '@hapi/boom'
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseToolkit } from '@hapi/hapi'
 */
