import { buildRedisClient } from '~/src/server/common/helpers/redis-client.js'
import { Engine as CatboxRedis } from '@hapi/catbox-redis'
import { Engine as CatboxMemory } from '@hapi/catbox-memory'

import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

/**
 * @typedef {'redis' | 'memory'} Engine
 */

/**
 * @param {Engine} [engine]
 * @returns CatboxRedis | CatboxMemory
 */
export function getCacheEngine(engine) {
  const logger = createLogger()

  if (engine === 'redis') {
    logger.info('Using Redis session cache')
    const redisClient = buildRedisClient(config.get('redis'))
    return new CatboxRedis({ client: redisClient })
  }

  if (config.get('isProduction')) {
    logger.error(
      'Catbox Memory is for local development only, it should not be used in production!'
    )
  }

  logger.info('Using Catbox Memory session cache')
  return new CatboxMemory()
}
