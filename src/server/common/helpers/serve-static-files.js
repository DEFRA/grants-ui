import { config } from '~/src/config/config.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'

const options = {
  auth: false,
  cache: {
    expiresIn: config.get('staticCacheTimeout'),
    privacy: 'private'
  }
}

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const serveStaticFiles = {
  plugin: {
    name: 'staticFiles',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/javascripts/application.min.js',
          handler: {
            file: './javascripts/dxt-application.min.js'
          },
          options
        },
        {
          method: 'GET',
          path: '/assets/{path*}',
          handler: {
            directory: {
              path: './dxt-assets/'
            }
          },
          options
        },
        {
          method: 'GET',
          path: '/favicon.ico',
          handler(_request, h) {
            return h.response().code(statusCodes.noContent).type('image/x-icon')
          },
          options
        },
        {
          method: 'GET',
          path: `${config.get('assetPath')}/{param*}`,
          handler: {
            directory: {
              path: '.',
              redirectToSlash: true
            }
          },
          options
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
