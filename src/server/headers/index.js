import { headersHandler } from './headers.handler.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const headers = {
  plugin: {
    name: 'headers',
    register(server) {
      server.route({
        method: 'GET',
        path: '/headers',
        handler: headersHandler
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
