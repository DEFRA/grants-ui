import { applicationStatuses } from '../status/mock-status.controller.js'

export const mockApplicationController = {
  handler: (request, h) => {
    const { code, clientRef } = request.params
    const { status } = request.payload || {}

    if (!status) {
      return h.response({ error: 'Missing status in payload' }).code(400)
    }

    const key = `${clientRef}_${code}`
    applicationStatuses.set(key, status)
    request.yar.set(`applicationStatus_${clientRef}_${code}`, status)

    return h
      .response({
        message: `Status for ${key} set to ${status}`
      })
      .code(200)
  }
}
