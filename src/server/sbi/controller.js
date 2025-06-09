import { sbiStore } from './state.js'

/**
 * A GDS styled example home page controller.
 * Provided as an example, remove or modify as required.
 * @satisfies {Partial<ServerRoute>}
 */
export const sbiController = {
  handler(request, h) {
    const {
      method,
      payload: { sbi }
    } = request

    if (method === 'post') {
      sbiStore.set('sbi', sbi)
      return h.response({ message: 'SBI updated successfully' }).code(200)
    }
    return h.response({ error: 'Method not allowed' }).code(405)
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
