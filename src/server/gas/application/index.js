// mock-application.js
import { mockApplicationController } from './mock-application.controller.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const mockApplication = {
  plugin: {
    name: 'mock-application',
    register(server) {
      server.route(
        mockApplicationController.map((route) => ({
          ...route,
          options: {
            auth: { mode: 'optional' }, // like your status route
            plugins: {
              crumb: false // disable CSRF for mock endpoint
            }
          }
        }))
      )
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
