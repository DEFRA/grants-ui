import {
  devHomeHandler,
  demoConfirmationHandler,
  demoDetailsHandler,
  demoDetailsPostHandler
} from './handlers/index.js'
import Boom from '@hapi/boom'

/** @type {Array<{code: number, boomMethod: string, message: string}>} */
export const errorRoutes = [
  { code: 400, boomMethod: 'badRequest', message: 'Bad request' },
  { code: 401, boomMethod: 'unauthorized', message: 'Unauthorized' },
  { code: 403, boomMethod: 'forbidden', message: 'Forbidden' },
  { code: 404, boomMethod: 'notFound', message: 'Not found' },
  { code: 429, boomMethod: 'tooManyRequests', message: 'Too many requests' },
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

      server.route({
        method: 'GET',
        path: '/dev/demo-details/{slug}',
        options: {
          auth: false
        },
        handler: demoDetailsHandler
      })

      server.route({
        method: 'POST',
        path: '/dev/demo-details/{slug}',
        options: {
          auth: false
        },
        handler: demoDetailsPostHandler
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
