import { constants } from 'http2'
const { HTTP_STATUS_FORBIDDEN, HTTP_STATUS_NOT_FOUND } = constants

export default {
  plugin: {
    name: 'errors',
    register: (server, _options) => {
      server.ext('onPreResponse', (request, h) => {
        const response = request.response

        if (response.isBoom) {
          const statusCode = response.output.statusCode

          // Catch any user in incorrect scope errors
          if (statusCode === HTTP_STATUS_FORBIDDEN) {
            return h.view('403').code(statusCode)
          }

          if (statusCode === HTTP_STATUS_NOT_FOUND) {
            return h.view('404').code(statusCode)
          }

          request.log('error', {
            statusCode,
            message: response.message,
            stack: response.data?.stack
          })

          return h.view('500').code(statusCode)
        }
        return h.continue
      })
    }
  }
}
