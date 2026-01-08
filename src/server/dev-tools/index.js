import { devHomeHandler, demoConfirmationHandler } from './handlers/index.js'
import Boom from '@hapi/boom'

const errorRoutes = [
  { code: 400, boomMethod: 'badRequest', message: 'Bad request' },
  { code: 401, boomMethod: 'unauthorized', message: 'Unauthorized' },
  { code: 403, boomMethod: 'forbidden', message: 'Forbidden' },
  { code: 404, boomMethod: 'notFound', message: 'Not found' },
  { code: 500, boomMethod: 'internal', message: 'Internal server error' },
  { code: 503, boomMethod: 'serverUnavailable', message: 'Service temporarily unavailable' }
]

/**
 * Development tools plugin - only registers routes when in development mode
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const devTools = {
  plugin: {
    name: 'dev-tools',
    register(server) {
      server.route({
        method: 'GET',
        path: '/dev',
        options: {
          auth: false
        },
        handler: devHomeHandler
      })

      server.route({
        method: 'GET',
        path: '/dev/demo-confirmation/{slug}',
        options: {
          auth: false
        },
        handler: demoConfirmationHandler
      })

      for (const { code, boomMethod, message } of errorRoutes) {
        server.route({
          method: 'GET',
          path: `/dev/test-${code}`,
          options: {
            auth: false
          },
          handler: () => {
            throw Boom[boomMethod](message)
          }
        })
      }
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
