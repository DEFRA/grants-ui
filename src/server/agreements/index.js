import { getAgreementController } from '~/src/server/agreements/controller.js'
import { config } from '~/src/config/config.js'
import { enforceAgreementPermission } from './permissions.js'

/**
 * Sets up the routes used to proxy the Agreements journey.
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
            },
            pre: [enforceAgreementPermission]
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
            pre: [enforceAgreementPermission],
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
