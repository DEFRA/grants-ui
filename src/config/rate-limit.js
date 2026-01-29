const isProduction = process.env.NODE_ENV === 'production'

/**
 * Rate limit configuration schema for convict
 * @type {import('convict').Schema<RateLimitConfig>}
 */
export const rateLimitSchema = {
  enabled: {
    doc: 'Enable rate limiting',
    format: Boolean,
    default: isProduction,
    env: 'RATE_LIMIT_ENABLED'
  },
  trustProxy: {
    doc: 'Trust X-Forwarded-For header',
    format: Boolean,
    default: true,
    env: 'RATE_LIMIT_TRUST_PROXY'
  },
  userLimit: {
    doc: 'Default requests per user/IP per period',
    format: Number,
    default: 100,
    env: 'RATE_LIMIT_USER_LIMIT'
  },
  userLimitPeriod: {
    doc: 'Rate limit period in milliseconds',
    format: Number,
    default: 60000,
    env: 'RATE_LIMIT_USER_LIMIT_PERIOD'
  },
  pathLimit: {
    doc: 'Total requests per path per period',
    format: Number,
    default: 2000,
    env: 'RATE_LIMIT_PATH_LIMIT'
  },
  authLimit: {
    doc: 'Max invalid auth attempts before blocking',
    format: Number,
    default: 5,
    env: 'RATE_LIMIT_AUTH_LIMIT'
  },
  authEndpointUserLimit: {
    doc: 'Requests per IP for auth endpoints per minute',
    format: Number,
    default: 10,
    env: 'RATE_LIMIT_AUTH_ENDPOINT_USER_LIMIT'
  },
  authEndpointPathLimit: {
    doc: 'Total requests per auth endpoint path per period',
    format: Number,
    default: 500,
    env: 'RATE_LIMIT_AUTH_ENDPOINT_PATH_LIMIT'
  }
}

/**
 * @typedef {object} RateLimitConfig
 * @property {boolean} enabled
 * @property {boolean} trustProxy
 * @property {number} userLimit
 * @property {number} userLimitPeriod
 * @property {number} pathLimit
 * @property {number} authLimit
 * @property {number} authEndpointUserLimit
 * @property {number} authEndpointPathLimit
 */
