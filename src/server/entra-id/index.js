import { entraIdHomeController } from './entra-id-home.controller.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const entraIdHome = {
  plugin: {
    name: 'entra-id-home',
    register(server) {
      server.route({
        method: 'GET',
        path: '/entra-id/home',
        options: {
          auth: {
            strategy: 'entra-id-session',
            mode: 'try'
          }
        },
        handler: (request, h) => {
          if (!request.auth.isAuthenticated) {
            return h.redirect('/login')
          }

          return entraIdHomeController.handler(request, h)
        }
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
