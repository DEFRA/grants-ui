import inert from '@hapi/inert'
import { config } from '~/src/config/config.js'
import { about } from '~/src/server/about/index.js'
import { auth } from '~/src/server/auth/index.js'
import { serveStaticFiles } from '~/src/server/common/helpers/serve-static-files.js'
import { health } from '~/src/server/health/index.js'
import { home } from '~/src/server/home/index.js'
import { sbi } from '~/src/server/sbi/index.js'
import { createTasklistRoute } from '~/src/server/common/tasklist/generic-tasklist-controller.js'

const enableSbiSelector = config.get('landGrants.enableSbiSelector')

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

      // Dev specific routes
      if (enableSbiSelector) {
        await server.register([sbi])
      }

      // Auth routes
      await server.register([auth])

      // Application specific routes, add your own routes here
      await server.register([home, about])

      // Generic tasklist routes
      await server.register([createTasklistRoute('example')])

      // Static assets
      await server.register([serveStaticFiles])
    }
  }
}
