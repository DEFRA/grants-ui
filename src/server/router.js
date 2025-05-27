import inert from '@hapi/inert'
import { about } from '~/src/server/about/index.js'
import { auth } from '~/src/server/auth/index.js'
import { serveStaticFiles } from '~/src/server/common/helpers/serve-static-files.js'
import { health } from '~/src/server/health/index.js'
import { home } from '~/src/server/home/index.js'
import { addingValueTasklist } from '~/src/server/controllers/adding-value-tasklist/adding-value-tasklist-controller.js'

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

      // Auth routes
      await server.register([auth])

      // Application specific routes, add your own routes here
      await server.register([home, about])

      // Static assets
      await server.register([serveStaticFiles])

      // Adding Value Tasklist
      await server.register([addingValueTasklist])
    }
  }
}
