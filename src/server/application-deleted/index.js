import { applicationDeletedGetRoute, applicationDeletedPostRoute } from './application-deleted.route.js'

export const applicationDeleted = {
  plugin: {
    name: 'application-deleted',

    /**
     * @param {Server} server
     */
    register: (server) => {
      server.route([applicationDeletedGetRoute, applicationDeletedPostRoute])
    }
  }
}

/**
 * @import { Server } from '@hapi/hapi'
 */
