const isProduction = process.env.NODE_ENV === 'production'

const oneHourMs = 3600000
const fourHoursMs = oneHourMs * 4

/**
 * Session configuration schema for convict
 * @type {import('convict').Schema<SessionConfig>}
 */
export const sessionSchema = {
  cache: {
    engine: {
      doc: 'backend cache is written to',
      format: ['redis', 'memory'],
      default: isProduction ? 'redis' : 'memory',
      env: 'SESSION_CACHE_ENGINE'
    },
    name: {
      doc: 'server side session cache name',
      format: String,
      default: 'grants-ui-session-cache'
    },
    ttl: {
      doc: 'server side session cache ttl',
      format: Number,
      default: fourHoursMs,
      env: 'SESSION_CACHE_TTL'
    },
    apiEndpoint: {
      doc: 'Grants UI Backend API endpoint',
      format: String,
      default: '',
      env: 'GRANTS_UI_BACKEND_URL'
    },
    authToken: {
      doc: 'Bearer token for authenticating with Grants UI Backend',
      format: String,
      default: '',
      env: 'GRANTS_UI_BACKEND_AUTH_TOKEN',
      sensitive: true
    },
    encryptionKey: {
      doc: 'Encryption key for securing bearer token transmission',
      format: String,
      default: '',
      env: 'GRANTS_UI_BACKEND_ENCRYPTION_KEY',
      sensitive: true
    }
  },
  cookie: {
    name: {
      doc: 'Session cookie name',
      format: String,
      default: 'grants-ui-session-auth'
    },
    cache: {
      segment: {
        doc: 'Session cookie cache segment name',
        format: String,
        default: 'auth'
      },
      ttl: {
        doc: 'Session cookie cache ttl',
        format: Number,
        default: fourHoursMs
      }
    },
    ttl: {
      doc: 'Session cookie ttl',
      format: Number,
      default: fourHoursMs,
      env: 'SESSION_COOKIE_TTL'
    },
    password: {
      doc: 'session cookie password',
      format: String,
      default: 'the-password-must-be-at-least-32-characters-long',
      env: 'SESSION_COOKIE_PASSWORD',
      sensitive: true
    },
    secure: {
      doc: 'set secure flag on cookie',
      format: Boolean,
      default: isProduction,
      env: 'SESSION_COOKIE_SECURE'
    }
  }
}

/**
 * @typedef {object} SessionConfig
 * @property {object} cache
 * @property {'redis' | 'memory'} cache.engine
 * @property {string} cache.name
 * @property {number} cache.ttl
 * @property {string} cache.apiEndpoint
 * @property {string} cache.authToken
 * @property {string} cache.encryptionKey
 * @property {object} cookie
 * @property {string} cookie.name
 * @property {object} cookie.cache
 * @property {string} cookie.cache.segment
 * @property {number} cookie.cache.ttl
 * @property {number} cookie.ttl
 * @property {string} cookie.password
 * @property {boolean} cookie.secure
 */
