import { statusCodes } from '~/src/server/common/constants/status-codes.js'

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
    request.logger.error(response?.stack)
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
