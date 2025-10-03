import { clearStateHandler } from './handlers/clear-state.handler.js'

/**
 * Development tools plugin - only registers routes when in development mode
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const clearState = {
  plugin: {
    name: 'clear-state',
    register(server) {
      server.route({
        method: 'GET',
        path: '/clear-application-state',
        handler: clearStateHandler
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
