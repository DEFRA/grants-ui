import {
  homeController,
  indexController
} from '~/src/server/home/controller.js'
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
          path: '/home',
          options: {
            auth: { mode: 'required' }
          },
          ...homeController
        }
      ])
      server.route([
        {
          method: 'GET',
          path: '/',
          options: {
            auth: { mode: 'optional' }
          },
          ...indexController
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
