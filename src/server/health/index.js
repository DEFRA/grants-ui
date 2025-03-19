import { healthController } from '~/src/server/health/controller.js'

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
        ...healthController
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
