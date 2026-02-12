// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import defraId from './defra-id.js'
import landGrants from './land-grants.js'
import agreements from './agreements.js'
import { sessionSchema } from './session.js'
import { redisSchema } from './redis.js'
import { rateLimitSchema } from './rate-limit.js'
import { devToolsSchema } from './dev-tools.js'
import { validateBackendAuthConfig } from './validate-backend-auth.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const oneHourMs = 3600000
const fourHoursMs = oneHourMs * 4
const oneWeekMs = 604800000

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const isDevelopment = process.env.NODE_ENV === 'development'

const convictConfig = {
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
    default: '',
    env: 'APP_BASE_URL'
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
    default: 'Farm and land service',
    env: 'SERVICE_NAME'
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
    },
    authToken: {
      doc: 'GAS API auth token',
      format: String,
      default: '',
      env: 'GAS_API_AUTH_TOKEN'
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
  sessionTimeout: {
    format: Number,
    default: fourHoursMs,
    env: 'SESSION_TIMEOUT'
  },
  session: sessionSchema,
  rateLimit: rateLimitSchema,
  redis: redisSchema,
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
  googleAnalytics: {
    trackingId: {
      doc: 'Google Analytics tracking ID',
      format: String,
      default: undefined,
      env: 'GA_TRACKING_ID'
    }
  },
  cookieConsent: {
    cookiePolicyUrl: {
      doc: 'URL for the cookie policy page (single source of truth for footer and banner links)',
      format: String,
      default: '/cookies',
      env: 'COOKIE_POLICY_URL'
    },
    cookieName: {
      doc: 'Name of the cookie consent preference cookie',
      format: String,
      default: 'cookie_consent'
    },
    expiryDays: {
      doc: 'Number of days before cookie consent expires',
      format: Number,
      default: 365,
      env: 'COOKIE_CONSENT_EXPIRY_DAYS'
    }
  },
  devTools: devToolsSchema,
  applicationLock: {
    secret: {
      doc: 'Secret used to sign application lock tokens',
      format: String,
      default: 'default-lock-token-secret',
      env: 'APPLICATION_LOCK_TOKEN_SECRET',
      sensitive: true
    },
    releaseTimeoutMs: {
      doc: 'Timeout in ms for releasing application locks during sign-out (best-effort)',
      format: 'nat',
      default: 2000,
      env: 'APPLICATION_LOCK_RELEASE_TIMEOUT_MS'
    }
  }
}

export const config = convict({
  ...convictConfig /** @type {SchemaObj<typeof convictConfig>} */,
  ...{
    defraId: /** @type {Schema<DefraIdConfig>} */ (defraId.getProperties()),
    landGrants: /** @type {Schema<LandGrantsConfig>} */ (landGrants.getProperties()),
    agreements: /** @type {Schema<AgreementsConfig>} */ (agreements.getProperties())
  }
})

config.validate({ allowed: 'strict' })

validateBackendAuthConfig(config)

/**
 * @import { Schema, SchemaObj } from 'convict'
 * @import { LandGrantsConfig } from '~/src/config/land-grants.js'
 * @import { AgreementsConfig } from '~/src/config/agreements.js'
 * @import { DefraIdConfig } from '~/src/config/defra-id.js'
 */
