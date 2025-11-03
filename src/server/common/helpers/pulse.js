import hapiPulse from 'hapi-pulse'
import { logger } from '~/src/server/common/helpers/logging/log.js'

const tenSeconds = 10 * 1000

const pulse = {
  plugin: hapiPulse,
  options: {
    logger,
    timeout: tenSeconds
  }
}

export { pulse }
