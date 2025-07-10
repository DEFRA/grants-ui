import { healthController } from './health.controller.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const health = {
  plugin: {
    name: 'health',
    register(server) {
      server.route({
        method: 'GET',
        path: '/health',
        // options: {
        //   auth: { mode: 'optional' }
        // },
        ...healthController
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
