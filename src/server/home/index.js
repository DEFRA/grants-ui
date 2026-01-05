import { homeController, indexController, personasController } from './home.controller.js'
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
          ...homeController
        }
      ])
      server.route([
        {
          method: 'GET',
          path: '/',
          options: {
            auth: false
          },
          ...indexController
        }
      ])
      server.route([
        {
          method: 'GET',
          path: '/personas/farm-payments',
          options: {
            auth: false
          },
          ...personasController
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
