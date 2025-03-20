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
        },
        {
          method: 'GET',
          path: '/stylesheets/application.min.css',
          handler: {
            file: './stylesheets/application.min.css'
          }
        },
        {
          method: 'GET',
          path: '/javascripts/application.min.js',
          handler: {
            file: './javascripts/application.min.js'
          }
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
