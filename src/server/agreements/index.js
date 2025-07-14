import { getAgreementController } from '~/src/server/agreements/controller.js'

/**
 * Sets up the routes used in the /agreements page.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const agreements = {
  plugin: {
    name: 'agreements',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/agreement/{path*}',
          options: {
            auth: false
          },
          ...getAgreementController
        },
        {
          method: 'POST',
          path: '/agreement/{path*}',
          options: {
            auth: false,
            plugins: {
              crumb: false // Disable CSRF protection for this route
            },
            payload: {
              output: 'stream',
              parse: false,
              allow: 'application/x-www-form-urlencoded'
            }
          },
          ...getAgreementController
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
