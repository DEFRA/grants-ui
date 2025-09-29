import { applicationStatuses } from '../status/mock-status.controller.js'

export const mockApplicationController = [
  {
    method: 'POST',
    path: '/mock/applications/{code}/{clientRef}/status',
    handler: (request, h) => {
      const { code, clientRef } = request.params
      const { status } = request.payload || {}

      if (!status) {
        return h.response({ error: 'Missing status in payload' }).code(400)
      }

      const key = `${code}_${clientRef}`
      applicationStatuses.set(key, status)
      request.yar.set(`applicationStatus_${clientRef}_${code}`, status)

      return h
        .response({
          message: `Status for ${key} set to ${status}`
        })
        .code(200)
    }
  },
  {
    method: 'DELETE',
    path: '/mock/applications/{code}/{clientRef}/status',
    handler: (request, h) => {
      const { code, clientRef } = request.params
      const key = `${code}_${clientRef}`
      applicationStatuses.delete(key)

      return h
        .response({
          message: `Status for ${key} cleared (will return 404 now)`
        })
        .code(200)
    }
  }
]
