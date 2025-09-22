import inert from '@hapi/inert'
import { config } from '~/src/config/config.js'
import { auth } from '~/src/server/auth/index.js'
import { serveStaticFiles } from '~/src/server/common/helpers/serve-static-files.js'
import { health } from '~/src/server/health/index.js'
import { home } from '~/src/server/home/index.js'
import { sbi } from '~/src/server/sbi/index.js'
import { createTasklistRoute } from '~/src/server/tasklist/tasklist.controller.js'
import { agreements } from '~/src/server/agreements/index.js'
import { devTools } from '~/src/server/dev-tools/index.js'
import { configConfirmation } from '~/src/server/confirmation/config-confirmation.js'
import { clearApplicationState } from './dev-tools/clear-application-state.js'
import { mockStatus } from './gas/index.js'

const defraIdEnabled = config.get('defraId.enabled')
const cdpEnvironment = config.get('cdpEnvironment')

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const router = {
  plugin: {
    name: 'router',
    async register(server) {
      await server.register([inert])

      // Health-check route. Used by platform to check if service is running, do not remove!
      await server.register([health])

      // Mock Status route
      await server.register([mockStatus])

      // Dev specific routes
      if (!defraIdEnabled) {
        await server.register([sbi])
      }

      // Auth routes
      await server.register([auth])

      // Application specific routes, add your own routes here
      await server.register([home, agreements, configConfirmation])

      // Development tools (only available in development mode)
      if (
        config.get('devTools.enabled') &&
        process.env.NODE_ENV !== 'production' &&
        process.env.ENVIRONMENT === 'local'
      ) {
        await server.register([devTools])
      }

      if (cdpEnvironment !== 'prod') {
        await server.register([clearApplicationState])
      }

      // Generic tasklist routes
      if (cdpEnvironment !== 'prod') {
        await server.register([createTasklistRoute('example')])
      }

      // Static assets
      await server.register([serveStaticFiles])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
