import { statusCodes } from '~/src/server/common/constants/status-codes.js'

/**
 * Maps GAS API error status codes to user-friendly error messages
 * @param {number} statusCode - HTTP status code
 * @returns {{heading: string, message: string}} - User-friendly error information
 */
export function getGasErrorMessage(statusCode) {
  const serviceError = {
    heading: 'Something went wrong',
    message:
      'An unexpected error occurred while submitting your application. Please try again or contact support if the problem persists.'
  }

  const serviceUnavailable = {
    heading: 'Service temporarily unavailable',
    message: 'The service is currently unavailable. Please try again in a few minutes.'
  }

  const messages = {
    400: serviceError,
    401: serviceError,
    403: serviceError,
    404: serviceError,
    409: serviceError,
    422: serviceError,
    429: serviceError,
    500: serviceUnavailable,
    502: serviceUnavailable,
    503: serviceUnavailable
  }

  if (messages[statusCode]) {
    return messages[statusCode]
  }

  return serviceError
}

/**
 * Handles GAS API error response and returns appropriate view
 * @param {object} h - Response toolkit
 * @param {object} context - Form context
 * @param {object} error - The error object (GrantApplicationServiceApiError)
 * @returns {object} - Error view response
 */
export function handleGasApiError(h, context, error) {
  const statusCode = error.status || statusCodes.internalServerError
  const errorInfo = getGasErrorMessage(statusCode)
  const refNumber = context.referenceNumber || 'N/A'

  return h
    .view('submission-error', {
      backLink: null,
      heading: errorInfo.heading,
      message: errorInfo.message,
      refNumber
    })
    .code(statusCode)
}
