import { getEntraIdOptions } from './entra-id-strategy.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

export default {
  plugin: {
    name: 'entra-id-auth',
    register: async (server) => {
      const entraIdOptions = await getEntraIdOptions()
      server.auth.strategy('entra-id', 'bell', entraIdOptions)

      server.route({
        method: ['GET', 'POST'],
        path: '/auth',
        options: {
          auth: {
            strategy: 'entra-id',
            mode: 'try'
          },
          handler: (request, h) => {
            if (!request.auth.isAuthenticated) {
              const error = request.auth.error
              log(LogCodes.AUTH.ENTRA_ID_AUTH_FAILURE, {
                errorMessage: error?.message,
                statusCode: error?.output?.statusCode,
                payload: error?.output?.payload ?? error?.data
              })
              return `Authentication failed: ${error.message}`
            }
            return h.response(request.auth.credentials).type('application/json')
          }
        }
      })
    }
  }
}
