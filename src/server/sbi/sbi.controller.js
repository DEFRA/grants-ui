import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { sbiStore } from './state.js'

/**
 * A GDS styled example home page controller.
 * Provided as an example, remove or modify as required.
 * @satisfies {Partial<ServerRoute>}
 */
export const sbiSelectorController = {
  handler(request, h) {
    const { method, payload } = request

    const sbi = payload['sbi']
    if (method === 'post') {
      sbiStore.set('sbi', sbi)

      return h.response({ message: 'SBI updated successfully' }).code(statusCodes.ok)
    }
    return h.response({ error: 'Method not allowed' }).code(statusCodes.methodNotAllowed)
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
