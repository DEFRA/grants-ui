import { statusCodes } from '~/src/server/common/constants/status-codes.js'

/**
 * Maps GAS API error status codes to user-friendly error messages
 * @param {number} statusCode - HTTP status code
 * @returns {{ heading: string, message: string }} - User-friendly error information
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

  /** @type {Record<number, { heading: string, message: string }>} */
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
 * @param {ResponseToolkit} h - Response toolkit
 * @param {{ referenceNumber?: string }} context - Form context
 * @param {GasApiError} error - The error object (GrantApplicationServiceApiError)
 * @returns {import('@hapi/hapi').ResponseObject} - Error view response
 */
export function handleGasApiError(h, context, error) {
  const statusCode = error.status || statusCodes.internalServerError
  const errorInfo = getGasErrorMessage(statusCode)
  const refNumber = context.referenceNumber || 'N/A'

  return h
    .view('submission-error', {
      pageTitle: errorInfo.heading,
      backLink: null,
      heading: errorInfo.heading,
      message: errorInfo.message,
      refNumber,
      supportEmail: h.request.app.model?.def?.metadata?.supportEmail ?? null
    })
    .code(statusCode)
}

/**
 * @typedef {Error & { status?: number, responseBody?: string, grantCode?: string }} GasApiError
 *   Shape of `GrantApplicationServiceApiError` (see
 *   `src/server/common/services/grant-application/grant-application.service.js`).
 *
 * @import { ResponseToolkit } from '@hapi/hapi'
 */
