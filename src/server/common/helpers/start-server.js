import { config } from '~/src/config/config.js'

import { createServer } from '~/src/server/index.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

async function startServer() {
  let server

  try {
    server = await createServer()
    await server.start()

    server.logger.info('Server started successfully')
    server.logger.info(
      `Access your frontend on http://localhost:${config.get('port')}`
    )
  } catch (error) {
    const logger = createLogger()
    logger.info('Server failed to start :(')
    logger.error(error)
  }

  return server
}

export { startServer }
