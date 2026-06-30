import { cannotSubmitRoute } from './cannot-submit.route.js'

export const cannotSubmit = {
  plugin: {
    name: 'cannot-submit',

    /**
     * @param {Server} server
     */
    register: async (server) => {
      server.route([cannotSubmitRoute])
    }
  }
}

/**
 * @import { Server } from '@hapi/hapi'
 */
