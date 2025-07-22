import plugin from '@defra/forms-engine-plugin'
import Bell from '@hapi/bell'
import Cookie from '@hapi/cookie'
import crumb from '@hapi/crumb'
import hapi from '@hapi/hapi'
import inert from '@hapi/inert'
import Scooter from '@hapi/scooter'
import h2o2 from '@hapi/h2o2'

import path from 'path'
import { fileURLToPath } from 'url'
import { config } from '~/src/config/config.js'
import { context } from '~/src/config/nunjucks/context/context.js'
import { grantsUiPaths, nunjucksConfig } from '~/src/config/nunjucks/nunjucks.js'
import auth from '~/src/plugins/auth.js'
import csp from '~/src/plugins/content-security-policy.js'
import sso from '~/src/plugins/sso.js'
import { formsService } from '~/src/server/common/forms/services/form.js'
import { outputService } from '~/src/server/common/forms/services/output.js'
import { formSubmissionService, loadSubmissionSchemaValidators } from '~/src/server/common/forms/services/submission.js'
import { catchAll } from '~/src/server/common/helpers/errors.js'
import { requestLogger } from '~/src/server/common/helpers/logging/request-logger.js'
import { setupProxy } from '~/src/server/common/helpers/proxy/setup-proxy.js'
import { pulse } from '~/src/server/common/helpers/pulse.js'
import { requestTracing } from '~/src/server/common/helpers/request-tracing.js'
import { secureContext } from '~/src/server/common/helpers/secure-context/index.js'
import { getCacheEngine } from '~/src/server/common/helpers/session-cache/cache-engine.js'
import { sessionCache } from '~/src/server/common/helpers/session-cache/session-cache.js'
import ConfirmationPageController from '~/src/server/confirmation/confirmation.controller.js'
import DeclarationPageController from '~/src/server/declaration/declaration.controller.js'
import CheckAnswersPageController from '~/src/server/land-grants/controllers/check-answers-page.controller.js'
import ConfirmFarmDetailsController from '~/src/server/land-grants/controllers/confirm-farm-details.controller.js'
import LandActionsCheckPageController from '~/src/server/land-grants/controllers/land-actions-check-page.controller.js'
import LandActionsPageController from '~/src/server/land-grants/controllers/land-actions-page.controller.js'
import LandParcelPageController from '~/src/server/land-grants/controllers/land-parcel-page.controller.js'
import SubmissionPageController from '~/src/server/land-grants/controllers/submission-page.controller.js'
import { tasklistBackButton } from '~/src/server/plugins/tasklist-back-button.js'
import { formatCurrency } from '../config/nunjucks/filters/format-currency.js'
import SectionEndController from './section-end/section-end.controller.js'
import { router } from './router.js'
import FlyingPigsSubmissionPageController from '~/src/server/non-land-grants/pigs-might-fly/controllers/pig-types-submission.controller.js'
import { PotentialFundingController } from '~/src/server/non-land-grants/pigs-might-fly/controllers/potential-funding.controller.js'
import { sbiStore } from './sbi/state.js'
import { statusCodes } from './common/constants/status-codes.js'

const SESSION_CACHE_NAME = 'session.cache.name'
const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

const getViewPaths = () => {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
  return [
    path.join(serverDir, 'views'),
    path.join(serverDir, 'land-grants/views'),
    path.join(serverDir, 'non-land-grants/pigs-might-fly/views'),
    path.join(serverDir, 'about'),
    path.join(serverDir, 'home'),
    path.join(serverDir, 'home/views'),
    path.join(serverDir, 'error'),
    path.join(serverDir, 'confirmation/views'),
    path.join(serverDir, 'declaration/views'),
    path.join(serverDir, 'score-results/views'),
    path.join(serverDir, 'section-end/views'),
    path.join(serverDir, 'tasklist/views'),
    path.join(serverDir, 'common/components'),
    ...grantsUiPaths
  ]
}

const createHapiServer = () => {
  return hapi.server({
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        }
      },
      auth: {
        mode: 'try',
        strategy: 'session'
      },
      files: {
        relativeTo: path.resolve(config.get('root'), '.public')
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    },
    cache: [
      {
        name: config.get(SESSION_CACHE_NAME),
        engine: getCacheEngine(/** @type {Engine} */ (config.get('session.cache.engine')))
      }
    ],
    state: {
      strictHeader: false
    }
  })
}

export const registerFormsPlugin = async (server, prefix = '') => {
  await server.register({
    plugin,
    options: {
      ...(prefix && { routes: { prefix } }),
      cacheName: config.get(SESSION_CACHE_NAME),
      baseUrl: config.get('baseUrl'),
      keyGenerator: generateKey,
      services: {
        formsService: await formsService(),
        formSubmissionService,
        outputService
      },
      filters: {
        formatCurrency
      },
      nunjucks: {
        baseLayoutPath: 'layouts/dxt-form.njk',
        paths: getViewPaths()
      },
      viewContext: context,
      controllers: {
        ConfirmationPageController,
        DeclarationPageController,
        CheckAnswersPageController,
        SubmissionPageController,
        ConfirmFarmDetailsController,
        LandParcelPageController,
        LandActionsPageController,
        LandActionsCheckPageController,
        SectionEndController,
        FlyingPigsSubmissionPageController,
        PotentialFundingController
      }
    }
  })
}

let cachedKey = null
let cachedSbi = null

const createLogger = (serverLogger) => ({
  info: serverLogger.info.bind(serverLogger),
  error: serverLogger.error.bind(serverLogger),
  warn: serverLogger.warn?.bind(serverLogger) || serverLogger.info.bind(serverLogger),
  debug: serverLogger.debug?.bind(serverLogger) || serverLogger.info.bind(serverLogger)
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getIdentity = (_) => {
  if (process.env.SBI_SELECTOR_ENABLED === 'true') {
    const sbi = sbiStore.get('sbi')
    return {
      userId: `user_${sbi}`,
      businessId: `business_${sbi}`,
      grantId: `grant_${sbi}`
    }
  }

  // If there are credentials from DEFRA ID, use those
  // if (identity) {
  //   return {
  //     userId: identity.userId,
  //     businessId: identity.businessId,
  //     grantId: identity.grantId
  //   }
  // }

  // Backup

  return {
    userId: 'placeholder-user-id',
    businessId: 'placeholder-business-id',
    grantId: 'placeholder-grant-id'
  }
}

async function fetchSavedStateFromApi(request) {
  if (!GRANTS_UI_BACKEND_ENDPOINT) {
    request.logger.warn('Backend not configured - skipping API call')
    return null
  }

  const { userId, businessId, grantId } = getIdentity(request)
  const apiUrl = `${GRANTS_UI_BACKEND_ENDPOINT}/state/?userId=${userId}&businessId=${businessId}&grantId=${grantId}`

  request.logger.info(`Fetching state from backend for identity: ${userId}:${businessId}:${grantId}`)

  let json = {}
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === statusCodes.notFound) {
        return null
      }

      throw new Error(`Failed to fetch saved state: ${response.status}`)
    }

    json = await response.json()
  } catch (err) {
    request.logger.error(['fetch-saved-state'], 'Failed to fetch saved state from API', err)
    throw err
  }

  return json || null
}

const generateKey = (request) => {
  const currentSbi = sbiStore.get('sbi')

  if (cachedKey === null || cachedSbi !== currentSbi) {
    const { userId, businessId, grantId } = getIdentity(request)
    cachedKey = `${userId}:${businessId}:${grantId}`
    cachedSbi = currentSbi
  }

  return cachedKey
}

export const clearCachedKey = () => {
  cachedKey = null
  cachedSbi = null
}

async function performSessionHydrationInternal(server, sbi, options = {}) {
  const { pathname = '/server-startup', method = 'GET', logContext = 'session hydration' } = options

  server.logger.info(`Starting ${logContext} for SBI:`, sbi)

  try {
    const request = {
      auth: {
        credentials: {
          userId: `user_${sbi}`,
          businessId: `business_${sbi}`,
          grantId: `grant_${sbi}`
        }
      },
      logger: createLogger(server.logger),
      url: { pathname },
      method
    }

    const result = await fetchSavedStateFromApi(request)
    server.logger.info(`${logContext} completed for SBI:`, sbi)
    return result
  } catch (error) {
    server.logger.error(`${logContext} failed for SBI:`, sbi, error.message)
    throw error
  }
}

async function performInitialSessionHydration(server) {
  const defaultSbi = sbiStore.get('sbi')
  return performSessionHydrationInternal(server, defaultSbi, {
    pathname: '/server-startup',
    method: 'GET',
    logContext: 'initial session hydration'
  })
}

export async function performSessionHydration(server, sbi) {
  return performSessionHydrationInternal(server, sbi, {
    pathname: '/sbi-change',
    method: 'POST',
    logContext: 'session hydration'
  })
}

const registerPlugins = async (server) => {
  await server.register([
    inert,
    crumb,
    Bell,
    Cookie,
    Scooter,
    csp,
    h2o2,
    auth,
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    sessionCache,
    nunjucksConfig,
    tasklistBackButton,
    sso
  ])

  await server.register([router])
}

export async function createServer() {
  const { log, LogCodes } = await import('~/src/server/common/helpers/logging/log.js')

  log(LogCodes.SYSTEM.STARTUP_PHASE, {
    phase: 'server_creation',
    status: 'starting'
  })

  setupProxy()
  log(LogCodes.SYSTEM.STARTUP_PHASE, {
    phase: 'proxy_setup',
    status: 'complete'
  })

  const server = createHapiServer()
  log(LogCodes.SYSTEM.STARTUP_PHASE, {
    phase: 'hapi_server_creation',
    status: 'complete'
  })

  log(LogCodes.SYSTEM.STARTUP_PHASE, {
    phase: 'plugin_registration',
    status: 'starting'
  })
  await registerPlugins(server)
  log(LogCodes.SYSTEM.STARTUP_PHASE, {
    phase: 'core_plugins',
    status: 'registered'
  })

  log(LogCodes.SYSTEM.STARTUP_PHASE, {
    phase: 'forms_plugin_registration',
    status: 'starting'
  })

  await registerFormsPlugin(server)

  log(LogCodes.SYSTEM.STARTUP_PHASE, {
    phase: 'forms_plugin',
    status: 'registered'
  })

  if (process.env.SBI_SELECTOR_ENABLED === 'true') {
    await performInitialSessionHydration(server)
  }

  loadSubmissionSchemaValidators()
  log(LogCodes.SYSTEM.STARTUP_PHASE, {
    phase: 'schema_validators',
    status: 'loaded'
  })

  server.ext('onPreHandler', (request, h) => {
    const prev = request.yar.get('visitedSubSections') || []
    const entry = request?.paramsArray[0] || null

    if (entry && !prev.includes(entry)) {
      prev.push(entry)
    }

    request.yar.set('visitedSubSections', prev)

    return h.continue
  })

  server.app.cache = server.cache({
    cache: config.get(SESSION_CACHE_NAME),
    segment: 'test-segment', // config.get('session.cache.segment')
    expiresIn: config.get('session.cache.ttl')
  })

  server.app.cacheTemp = server.cache({
    cache: config.get(SESSION_CACHE_NAME),
    segment: 'section-data',
    expiresIn: config.get('session.cache.ttl')
  })

  server.ext('onPreResponse', catchAll)

  return server
}
