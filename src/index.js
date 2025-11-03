import process from 'node:process'

import { logger } from '~/src/server/common/helpers/logging/log.js'
import { startServer } from '~/src/server/common/helpers/start-server.js'

await startServer()

process.on('unhandledRejection', (error) => {
  logger.info('Unhandled rejection')
  logger.error(error)
  process.exitCode = 1
})
