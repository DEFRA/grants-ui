import { getAgreementController } from '~/src/server/agreements/controller.js'
import { config } from '~/src/config/config.js'

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
          path: `${String(config.get('agreements.baseUrl'))}/{path*}`,
          options: {
            auth: {
              mode: 'required',
              strategy: 'session'
            }
          },
          ...getAgreementController
        },
        {
          method: 'POST',
          path: `${String(config.get('agreements.baseUrl'))}/{path*}`,
          options: {
            auth: {
              mode: 'required',
              strategy: 'session'
            },
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
