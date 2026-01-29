const isProduction = process.env.NODE_ENV === 'production'

/**
 * Redis configuration schema for convict
 * @type {import('convict').Schema<RedisConfig>}
 */
export const redisSchema = {
  host: {
    doc: 'Redis cache host',
    format: String,
    default: '127.0.0.1',
    env: 'REDIS_HOST'
  },
  username: {
    doc: 'Redis cache username',
    format: String,
    default: '',
    env: 'REDIS_USERNAME'
  },
  password: {
    doc: 'Redis cache password',
    format: '*',
    default: '',
    sensitive: true,
    env: 'REDIS_PASSWORD'
  },
  keyPrefix: {
    doc: 'Redis cache key prefix name used to isolate the cached results across multiple clients',
    format: String,
    default: 'grants-ui:',
    env: 'REDIS_KEY_PREFIX'
  },
  useSingleInstanceCache: {
    doc: 'Connect to a single instance of redis instead of a cluster.',
    format: Boolean,
    default: !isProduction,
    env: 'USE_SINGLE_INSTANCE_CACHE'
  },
  useTLS: {
    doc: 'Connect to redis using TLS',
    format: Boolean,
    default: isProduction,
    env: 'REDIS_TLS'
  },
  connectTimeout: {
    doc: 'Redis connection timeout in milliseconds',
    format: Number,
    default: 30000,
    env: 'REDIS_CONNECT_TIMEOUT'
  },
  retryDelay: {
    doc: 'Redis retry delay in milliseconds',
    format: Number,
    default: 1000,
    env: 'REDIS_RETRY_DELAY'
  },
  maxRetries: {
    doc: 'Redis max retries per request',
    format: Number,
    default: 10,
    env: 'REDIS_MAX_RETRIES'
  }
}

/**
 * @typedef {object} RedisConfig
 * @property {string} host
 * @property {string} username
 * @property {string} password
 * @property {string} keyPrefix
 * @property {boolean} useSingleInstanceCache
 * @property {boolean} useTLS
 * @property {number} connectTimeout
 * @property {number} retryDelay
 * @property {number} maxRetries
 */
