// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import defraId from './defra-id.js'
import landGrants from './land-grants.js'
import agreements from './agreements.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

convict.addFormat('url', function (val) {
  if (!val) {
    return
  }
  try {
    // eslint-disable-next-line no-new
    new URL(val)
  } catch {
    throw new Error('must be a valid URL')
  }
})

const fourHoursMs = 14400000
const oneWeekMs = 604800000

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const isDevelopment = process.env.NODE_ENV === 'development'

export const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is currently in, with the addition of "local"',
    format: ['local', 'infra-dev', 'management', 'dev', 'test', 'perf-test', 'ext-test', 'prod'],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 3000,
    env: 'PORT'
  },
  baseUrl: {
    doc: 'Base URL for the application',
    format: String,
    default: 'http://localhost:3000',
    env: 'BASE_URL'
  },
  staticCacheTimeout: {
    doc: 'Static cache timeout in milliseconds',
    format: Number,
    default: oneWeekMs,
    env: 'STATIC_CACHE_TIMEOUT'
  },
  gitRepositoryName: {
    doc: 'The name of the git repository which is used for logging events',
    format: String,
    default: 'grants-ui'
  },
  serviceName: {
    doc: 'Applications Service Name',
    format: String,
    default: 'Manage land-based actions'
  },
  root: {
    doc: 'Project root',
    format: String,
    default: path.resolve(dirname, '../..')
  },
  assetPath: {
    doc: 'Asset path',
    format: String,
    default: '/public',
    env: 'ASSET_PATH'
  },
  isProduction: {
    doc: 'If this application running in the production environment',
    format: Boolean,
    default: isProduction
  },
  isDevelopment: {
    doc: 'If this application running in the development environment',
    format: Boolean,
    default: isDevelopment
  },
  isTest: {
    doc: 'If this application running in the test environment',
    format: Boolean,
    default: isTest
  },
  gas: {
    apiEndpoint: {
      doc: 'GAS API endpoint',
      format: String,
      default: '',
      env: 'GAS_API_URL'
    }
  },
  consolidatedView: {
    mockDALEnabled: {
      doc: 'Consolidated View API mock enabled',
      format: Boolean,
      default: false,
      env: 'CV_API_MOCK_ENABLED'
    },
    apiEndpoint: {
      doc: 'Consolidated View API endpoint',
      format: String,
      default: '',
      env: 'CV_API_ENDPOINT'
    },
    authEmail: {
      doc: 'Consolidated View AuthEmail',
      format: String,
      default: '',
      env: 'CV_API_AUTH_EMAIL'
    }
  },
  feedbackLink: {
    doc: 'Used in your phase banner. Can be a URL or more commonly mailto mailto:feedback@department.gov.uk',
    format: String,
    default: '',
    env: 'FEEDBACK_LINK'
  },
  entra: {
    tokenEndpoint: {
      doc: 'Microsoft entra token endpoint',
      format: String,
      default: '',
      env: 'ENTRA_INTERNAL_TOKEN_URL'
    },
    tenantId: {
      doc: 'Microsoft tenant ID',
      format: String,
      default: '',
      env: 'ENTRA_INTERNAL_TENANT_ID'
    },
    clientId: {
      doc: 'Microsoft client ID',
      format: String,
      default: '',
      env: 'ENTRA_INTERNAL_CLIENT_ID'
    },
    clientSecret: {
      doc: 'Microsoft client secret',
      format: String,
      default: '',
      env: 'ENTRA_INTERNAL_CLIENT_SECRET'
    }
  },
  log: {
    enabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: process.env.NODE_ENV !== 'test',
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in.',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers'] : []
    }
  },
  httpProxy: /** @type {SchemaObj<string | null>} */ ({
    doc: 'HTTP Proxy',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  }),
  isSecureContextEnabled: {
    doc: 'Enable Secure Context',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  isMetricsEnabled: {
    doc: 'Enable metrics reporting',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_METRICS'
  },
  session: {
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
        default: 'session',
        env: 'SESSION_CACHE_NAME'
      },
      ttl: {
        doc: 'server side session cache ttl',
        format: Number,
        default: fourHoursMs,
        env: 'SESSION_CACHE_TTL'
      },
      apiEndpoint: {
        doc: 'Grants UI Backend API endpoint',
        format: 'url',
        default: '',
        env: 'GRANTS_UI_BACKEND_URL'
      }
    },
    cookie: {
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
  },
  redis: /** @type {Schema<RedisConfig>} */ ({
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
    }
  }),
  nunjucks: {
    watch: {
      doc: 'Reload templates when they are changed.',
      format: Boolean,
      default: isDevelopment
    },
    noCache: {
      doc: 'Use a cache and recompile templates each time',
      format: Boolean,
      default: isDevelopment
    }
  },
  tracing: {
    header: {
      doc: 'Which header to track',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  defraId: defraId.getProperties(),
  landGrants: /** @type {Schema<LandGrantsConfig>} */ (landGrants.getProperties()),
  agreements: /** @type {Schema<AgreementsConfig>} */ (agreements.getProperties())
})

config.validate({ allowed: 'strict' })

/**
 * @import { Schema, SchemaObj } from 'convict'
 * @import { RedisConfig } from '~/src/server/common/helpers/redis-client.js'
 * @import { LandGrantsConfig } from '~/src/config/land-grants.js'
 */
