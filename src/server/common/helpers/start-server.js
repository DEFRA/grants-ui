import { config } from '~/src/config/config.js'

import { createServer } from '~/src/server/index.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'
import { closeFormsRedisClient } from '~/src/server/common/forms/services/forms-redis.js'

async function startServer() {
  let server

  try {
    server = await createServer()
    await server.start()

    server.logger.info('Server started successfully')
    server.logger.info(`Access your frontend on http://localhost:${config.get('port')}`)
  } catch (error) {
    logger.info('Server failed to start :(')
    logger.error(error)
  }

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down`)
    try {
      if (server) {
        await server.stop({ timeout: 10000 })
      }
      await closeFormsRedisClient()
    } catch (error) {
      logger.error(`Error during shutdown: ${error}`)
      process.exitCode = 1
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  return server
}

export { startServer }
