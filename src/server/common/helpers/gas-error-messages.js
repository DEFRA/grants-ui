import { statusCodes } from '~/src/server/common/constants/status-codes.js'

/**
 * Maps GAS API error status codes to user-friendly error messages
 * @param {number} statusCode - HTTP status code
 * @returns {{heading: string, message: string}} - User-friendly error information
 */
export function getGasErrorMessage(statusCode) {
  const authenticationError = {
    heading: 'Authentication issue',
    message: 'Your session may have expired. Please sign in again and try submitting your application.'
  }
  const serviceUnavailable = {
    heading: 'Service temporarily unavailable',
    message: 'The service is currently unavailable. Please try again in a few minutes.'
  }

  const fallbackMessage = {
    heading: 'Something went wrong',
    message:
      'An unexpected error occurred while submitting your application. Please try again or contact support if the problem persists.'
  }

  const messages = {
    400: {
      heading: 'Invalid application data',
      message: 'There was a problem with your application data. Please review your answers and try again.'
    },
    401: authenticationError,
    403: authenticationError,
    404: {
      heading: 'Service not found',
      message: 'We could not find the service endpoint. Please contact support for assistance.'
    },
    409: {
      heading: 'Application already submitted',
      message:
        'This application has already been submitted. Please check your previous submissions or contact support if you believe this is an error.'
    },
    422: {
      heading: 'Application validation failed',
      message: 'Your application could not be processed. Please check your entries and try again.'
    },
    429: {
      heading: 'Too many requests',
      message: 'You have submitted too many requests. Please wait a moment and try again.'
    },
    500: serviceUnavailable,
    502: serviceUnavailable,
    503: serviceUnavailable
  }

  if (messages[statusCode]) {
    return messages[statusCode]
  }

  return fallbackMessage
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
    .view('land-grants/submission-error', {
      backLink: null,
      heading: errorInfo.heading,
      message: errorInfo.message,
      refNumber
    })
    .code(statusCode)
}
