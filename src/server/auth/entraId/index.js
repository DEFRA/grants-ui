import { getEntraIdOptions } from './entra-id-strategy.js'

export default {
  plugin: {
    name: 'entra-id-auth',
    register: async (server) => {
      const entraIdOptions = await getEntraIdOptions()
      server.auth.strategy('entra-id', 'bell', entraIdOptions)

      server.route({
        method: ['GET', 'POST'],
        path: '/auth/entra-id-poc',
        options: {
          auth: {
            strategy: 'entra-id',
            mode: 'try'
          },
          handler: (request, h) => {
            if (!request.auth.isAuthenticated) {
              return `Authentication failed: ${request.auth.error.message}`
            }
            return h.response(request.auth.credentials).type('application/json')
          }
        }
      })
    }
  }
}
