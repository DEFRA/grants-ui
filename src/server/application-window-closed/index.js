import { applicationWindowClosedGetRoute } from './application-window-closed.route.js'

export const applicationWindowClosed = {
  plugin: {
    name: 'application-window-closed',

    /**
     * @param {Server} server
     */
    register: (server) => {
      server.route([applicationWindowClosedGetRoute])
    }
  }
}

/**
 * @import { Server } from '@hapi/hapi'
 */
