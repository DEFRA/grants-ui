import { applicationDeletedRoute } from './application-deleted.route.js'

export const applicationDeleted = {
  plugin: {
    name: 'application-deleted',

    /**
     * @param {Server} server
     */
    register: async (server) => {
      server.route([applicationDeletedRoute])
    }
  }
}

/**
 * @import { Server } from '@hapi/hapi'
 */
