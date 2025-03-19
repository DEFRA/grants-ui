import { pino } from 'pino'

import { loggerOptions } from '~/src/server/common/helpers/logging/logger-options.js'

const logger = pino(loggerOptions)

function createLogger() {
  return logger
}

export { createLogger }
