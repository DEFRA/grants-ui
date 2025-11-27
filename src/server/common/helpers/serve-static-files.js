import { config } from '~/src/config/config.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'

/** @type {RouteOptions<ReqRefDefaults>} */
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
          path: '/img/{param*}',
          handler(_request, h) {
            const emptySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"></svg>'
            return h.response(emptySvg).code(statusCodes.ok).type('image/svg+xml')
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
 * @import { ReqRefDefaults, RouteOptions, ServerRegisterPluginObject } from '@hapi/hapi'
 */
