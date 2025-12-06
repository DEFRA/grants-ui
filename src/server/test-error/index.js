import { testErrorController } from './test-error.controller.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const testError = {
  plugin: {
    name: 'test-error',
    register(server) {
      server.route({
        method: 'GET',
        path: '/test-{statusCode}',
        options: {
          auth: { mode: 'optional' }
        },
        ...testErrorController
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
