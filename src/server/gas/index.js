// mock-status.js
import { mockStatusController } from './mock-status.controller.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const mockStatus = {
  plugin: {
    name: 'mock-status',
    register(server) {
      server.route({
        method: 'GET',
        path: '/grants/{code}/applications/{clientRef}/status',
        options: {
          auth: { mode: 'optional' } // same as health
        },
        ...mockStatusController
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
