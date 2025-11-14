import { cookiesController, cookiesPostController } from './cookies.controller.js'
import { COOKIE_PAGE_URL } from './constants.js'

/**
 * Sets up the routes for the cookies page.
 * These routes are registered in src/server/router.js.
 * The cookie page URL is configurable via the COOKIE_POLICY_URL environment variable.
 */

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const cookies = {
  plugin: {
    name: 'cookies',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: COOKIE_PAGE_URL,
          options: {
            auth: false
          },
          ...cookiesController
        },
        {
          method: 'POST',
          path: COOKIE_PAGE_URL,
          options: {
            auth: false,
            plugins: {
              crumb: false
            }
          },
          ...cookiesPostController
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
