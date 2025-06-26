import {
  homeController,
  indexController
} from '~/src/server/home/home.controller.js'
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
          // options: {
          //   auth: { mode: 'required' }
          // },
          ...homeController
        }
      ])
      server.route([
        {
          method: 'GET',
          path: '/',
          // options: {
          //   auth: { mode: 'optional' }
          // },
          ...indexController
        }
      ])
      server.route([
        {
          method: 'GET',
          path: '/auth-test',
          options: {
            auth: 'defra-id'
          },
          handler: (request, h) => {
            return h.response({
              message: 'Authentication successful',
              user: request.auth.credentials
            })
          }
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
