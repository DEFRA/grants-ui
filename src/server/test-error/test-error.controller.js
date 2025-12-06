import Boom from '@hapi/boom'

/**
 * Test error endpoint for alerting infrastructure testing
 * Returns HTTP error responses based on the status code in the URL
 * @satisfies {Partial<ServerRoute>}
 */
export const testErrorController = {
  handler(request, h) {
    const statusCode = parseInt(request.params.statusCode, 10)

    // Validate status code is a valid error code (4xx or 5xx)
    if (statusCode < 400 || statusCode > 599) {
      throw Boom.badRequest('Status code must be between 400 and 599')
    }

    const message = `Test ${statusCode} error for alerting infrastructure - this is intentional`

    // Use Boom to return appropriate error response
    throw Boom.boomify(new Error(message), { statusCode })
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
