import { Cluster, Redis } from 'ioredis'

import { logger } from '~/src/server/common/helpers/logging/log.js'
import { assignIfDefined } from '~/src/server/common/utils/objects.js'

/**
 * @typedef {object} RedisConfig
 * @property {string} host
 * @property {string} username
 * @property {string} password
 * @property {string} keyPrefix
 * @property {boolean} useSingleInstanceCache
 * @property {boolean} useTLS
 * @property {number} [connectTimeout]
 * @property {number} [retryDelay]
 * @property {number} [maxRetries]
 * @property {boolean} [enableOfflineQueue]
 * @property {number} [commandTimeout]
 */

/**
 * Setup Redis and provide a redis client
 *
 * Local development - 1 Redis instance
 * Environments - Elasticache / Redis Cluster with username and password
 * @param {RedisConfig} redisConfig - Redis config
 * @returns {Cluster | Redis}
 */
export function buildRedisClient(redisConfig) {
  const port = 6379
  const db = 0
  const keyPrefix = redisConfig.keyPrefix
  const host = redisConfig.host
  let redisClient

  const credentials =
    redisConfig.username === ''
      ? {}
      : {
          username: redisConfig.username,
          password: redisConfig.password
        }
  const tls = redisConfig.useTLS ? { tls: {} } : {}

  if (redisConfig.useSingleInstanceCache) {
    /** @type {RedisOptions} */
    const redisOptions = {
      port,
      host,
      db,
      keyPrefix,
      ...credentials,
      ...tls
    }

    assignIfDefined(redisOptions, redisConfig, {
      connectTimeout: 'connectTimeout',
      retryDelay: 'retryDelayOnFailover',
      maxRetries: 'maxRetriesPerRequest',
      enableOfflineQueue: 'enableOfflineQueue',
      commandTimeout: 'commandTimeout'
    })

    redisClient = new Redis(redisOptions)
  } else {
    redisClient = new Cluster(
      [
        {
          host,
          port
        }
      ],
      {
        keyPrefix,
        slotsRefreshTimeout: 10000,
        dnsLookup: (address, callback) => callback(null, address),
        enableOfflineQueue: redisConfig.enableOfflineQueue,
        redisOptions: {
          db,
          ...credentials,
          ...tls,
          commandTimeout: redisConfig.commandTimeout,
          maxRetriesPerRequest: redisConfig.maxRetries
        }
      }
    )
  }

  redisClient.on('connect', () => {
    logger.info('Connected to Redis server')
  })

  redisClient.on('error', (error) => {
    logger.error(`Redis connection error ${error}`)
  })

  return redisClient
}

/**
 * @import { RedisOptions } from 'ioredis'
 */
