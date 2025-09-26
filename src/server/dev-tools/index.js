import { devHomeHandler, demoConfirmationHandler } from './handlers/index.js'

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
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
