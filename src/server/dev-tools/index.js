import { devHomeHandler, demoConfirmationHandler } from './handlers/index.js'
import Boom from '@hapi/boom'

/**
 * Development tools plugin - only registers routes when in development mode
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const devTools = {
  plugin: {
    name: 'dev-tools',
    register(server) {
      server.route({
        method: 'GET',
        path: '/dev',
        options: {
          auth: false
        },
        handler: devHomeHandler
      })

      server.route({
        method: 'GET',
        path: '/dev/demo-confirmation/{slug}',
        options: {
          auth: false
        },
        handler: demoConfirmationHandler
      })

      server.route({
        method: 'GET',
        path: '/dev/test-503',
        options: {
          auth: false
        },
        handler: () => {
          throw Boom.serverUnavailable('Service temporarily unavailable')
        }
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
