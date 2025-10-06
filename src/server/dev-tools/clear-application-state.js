import { clearApplicationStateHandler } from './handlers/clear-application-state.handler.js'

/**
 * Development tools plugin - only registers routes when in development mode
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const clearApplicationState = {
  plugin: {
    name: 'clear-application-state',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/clear-application-state',
          handler: clearApplicationStateHandler
        },
        {
          method: 'GET',
          path: '/{slug}/clear-application-state',
          handler: clearApplicationStateHandler
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
