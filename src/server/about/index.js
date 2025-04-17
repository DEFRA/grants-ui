import { aboutController } from '~/src/server/about/controller.js'

/**
 * Sets up the routes used in the /about page.
 * These routes are registered in src/server/router.js.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const about = {
  plugin: {
    name: 'about',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/about',
          // options: {
          //   auth: { mode: 'optional' }
          // },
          ...aboutController
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
