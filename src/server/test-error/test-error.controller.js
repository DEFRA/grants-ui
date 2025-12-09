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
 * Test slow response endpoint for alerting infrastructure testing
 * Delays the response by the specified number of milliseconds
 * @satisfies {Partial<ServerRoute>}
 */
export const testSlowController = {
  async handler(request, h) {
    const milliseconds = parseInt(request.params.milliseconds, 10)

    // Validate milliseconds is a positive number and not unreasonably large
    if (isNaN(milliseconds) || milliseconds < 0) {
      throw Boom.badRequest('Milliseconds must be a positive number')
    }

    if (milliseconds > 300000) {
      // 5 minutes max
      throw Boom.badRequest('Milliseconds must not exceed 300000 (5 minutes)')
    }

    // Wait for the specified duration
    await new Promise((resolve) => setTimeout(resolve, milliseconds))

    // Return success response
    return h
      .response({
        message: `Test slow response completed after ${milliseconds}ms - this is intentional`,
        delay: milliseconds
      })
      .code(200)
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
