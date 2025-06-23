import { TasklistGenerator } from './tasklist-generator.js'
import { loadTasklistConfig, validateTasklistConfig } from './config-loader.js'

const HTTP_MOVED_PERMANENTLY = 301

export function createTasklistRoute(tasklistId) {
  return {
    plugin: {
      name: `${tasklistId}Tasklist`,
      register(server) {
        server.route({
          method: 'GET',
          path: `/${tasklistId}-tasklist`,
          handler: (_request, h) => {
            return h
              .redirect(`/${tasklistId}-tasklist/tasklist`)
              .code(HTTP_MOVED_PERMANENTLY)
          }
        })

        server.route({
          method: 'GET',
          path: `/${tasklistId}-tasklist/tasklist`,
          handler: async (request, h) => {
            try {
              const config = await loadTasklistConfig(tasklistId)
              validateTasklistConfig(config)

              let data = {}
              try {
                data = (await server.app.cacheTemp.get(request.yar.id)) || {}
              } catch (error) {
                request.logger.warn(
                  {
                    error: error.message,
                    sessionId: request.yar.id
                  },
                  'Cache retrieval failed, using empty data'
                )
                data = {}
              }
              const visitedSubSections =
                request.yar.get('visitedSubSections') || []

              const generator = new TasklistGenerator(config)
              const tasklistModel = generator.generateTasklist(
                data,
                visitedSubSections
              )

              return h.view('views/generic-tasklist-page', {
                ...tasklistModel,
                tasklistId
              })
            } catch (error) {
              request.log(
                'error',
                `Failed to generate tasklist for ${tasklistId}: ${error.message}`
              )
              throw error
            }
          }
        })
      }
    }
  }
}
