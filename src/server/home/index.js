import { homeController } from '~/src/server/home/controller.js'

/**
 * Sets up the routes used in the home page.
 * These routes are registered in src/server/router.js.
 */

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const home = {
  plugin: {
    name: 'home',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/',
          ...homeController
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
