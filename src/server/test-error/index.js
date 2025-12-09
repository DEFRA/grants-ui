import { testErrorController, testSlowController, testOkController } from './test-error.controller.js'

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
      server.route({
        method: 'GET',
        path: '/test-slow-{milliseconds}',
        options: {
          auth: { mode: 'optional' }
        },
        ...testSlowController
      })
      server.route({
        method: 'GET',
        path: '/test-ok',
        options: {
          auth: { mode: 'optional' }
        },
        ...testOkController
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
