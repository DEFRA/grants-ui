// mock-application.js
import { mockApplicationController } from './mock-application.controller.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const mockApplication = {
  plugin: {
    name: 'mock-application',
    register(server) {
      server.route({
        method: 'POST',
        path: '/mock/applications/{code}/{clientRef}/status',
        options: {
          auth: { mode: 'optional' }, // like your status route
          plugins: {
            crumb: false // disable CSRF for mock endpoint
          }
        },
        ...mockApplicationController
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
