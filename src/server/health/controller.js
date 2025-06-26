import { statusCodes } from '~/src/server/common/constants/status-codes.js'

/**
 * A generic health-check endpoint. Used by the platform to check if the service is up and handling requests.
 * @satisfies {Partial<ServerRoute>}
 */
export const healthController = {
  handler(_request, h) {
    return h.response({ message: 'success' }).code(statusCodes.ok)
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
