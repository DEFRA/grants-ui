import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { sbiStore } from './state.js'
import { performSessionLoading } from '~/src/server/index.js'

/**
 * A GDS styled example home page controller.
 * Provided as an example, remove or modify as required.
 * @satisfies {Partial<ServerRoute>}
 */
export const sbiSelectorController = {
  async handler(request, h) {
    const {
      method,
      payload: { sbi }
    } = request

    if (method === 'post') {
      sbiStore.set('sbi', sbi)
      request.logger.info(`SBI selector: Updated to ${sbi} - New identity: user_${sbi}:business_${sbi}:grant_${sbi}`)
      await performSessionLoading(request.server, true)

      return h.response({ message: 'SBI updated successfully' }).code(statusCodes.ok)
    }
    return h.response({ error: 'Method not allowed' }).code(statusCodes.methodNotAllowed)
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
