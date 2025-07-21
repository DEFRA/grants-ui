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
// import auth from '~/src/plugins/auth.js'
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
  const currentFilePath = fileURLToPath(import.meta.url)
  const isRunningBuiltCode = currentFilePath.includes('.server')
  const basePath = isRunningBuiltCode ? '.server/server' : 'src/server'
  const paths = [
    `${basePath}/non-land-grants/pigs-might-fly/views`,
    `${basePath}/land-grants/views`,
    `${basePath}/views`,
    `${basePath}/common/components`,
    ...grantsUiPaths
  ]
  return paths
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
      // auth: {
      //   mode: 'try',
      //   strategy: 'session'
      // },
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
      keyGenerator: generateKey,
      sessionPurger: createSessionPurger(server),
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

const createMockLogger = (serverLogger) => ({
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
    const mockRequest = {
      auth: {
        credentials: {
          userId: `user_${sbi}`,
          businessId: `business_${sbi}`,
          grantId: `grant_${sbi}`
        }
      },
      logger: createMockLogger(server.logger),
      url: { pathname },
      method
    }

    const result = await fetchSavedStateFromApi(mockRequest)
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

async function deleteSessionFromBackend(request) {
  const { userId, businessId, grantId } = getIdentity(request)
  const apiUrl = `${GRANTS_UI_BACKEND_ENDPOINT}/state/?userId=${userId}&businessId=${businessId}&grantId=${grantId}`

  request.logger.info(`Purging session from MongoDB for identity: ${userId}:${businessId}:${grantId}`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(apiUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok && response.status !== statusCodes.notFound) {
      throw new Error(`Failed to delete session from backend: ${response.status}`)
    }

    request.logger.info(`Session successfully purged from MongoDB for identity: ${userId}:${businessId}:${grantId}`)
    return true
  } catch (err) {
    if (err.name === 'AbortError') {
      request.logger.error(['session-purger'], 'MongoDB purge timed out after 10 seconds', err)
    } else {
      request.logger.error(['session-purger'], 'Failed to purge session from MongoDB', err)
    }
    return false
  }
}

export function createSessionPurger(server) {
  const isEnabled = process.env.ENABLE_SESSION_PURGER !== 'false' // Enabled by default

  return async (request) => {
    if (!isEnabled) {
      request.logger.debug('SessionPurger: Disabled, using default clearState behavior')
      return false // Signal to use fallback
    }

    request.logger.info('SessionPurger: Starting session purge process')

    let mongoSuccess = true
    let redisSuccess = true

    try {
      // Step 1: Clear MongoDB first
      mongoSuccess = await deleteSessionFromBackend(request)
      if (!mongoSuccess) {
        request.logger.warn('SessionPurger: MongoDB purge failed, continuing with Redis clearing')
      }

      // Step 2: Clear Redis cache
      try {
        const cache = server.app.cache
        const sessionKey = generateKey(request)

        if (request.yar.id) {
          await cache.drop(sessionKey)
          request.logger.info(`SessionPurger: Redis cache cleared for key: ${sessionKey}`)
        } else {
          request.logger.warn('SessionPurger: No session ID available for Redis clearing')
        }
      } catch (redisErr) {
        redisSuccess = false
        request.logger.error(['session-purger'], 'SessionPurger: Failed to clear Redis cache', redisErr)
      }

      const success = mongoSuccess && redisSuccess
      if (success) {
        request.logger.info('SessionPurger: Session purge completed successfully')
      } else {
        request.logger.warn('SessionPurger: Session purge completed with some failures')
      }

      return success
    } catch (err) {
      request.logger.error(['session-purger'], 'SessionPurger: Failed to purge session', err)
      throw err
    }
  }
}

const registerPlugins = async (server) => {
  await server.register([router])

  await server.register([
    inert,
    crumb,
    Bell,
    Cookie,
    Scooter,
    csp,
    h2o2,
    // auth,
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    sessionCache,
    nunjucksConfig,
    tasklistBackButton,
    sso
  ])
}

export async function createServer() {
  setupProxy()
  const server = createHapiServer()

  await registerPlugins(server)
  await registerFormsPlugin(server)

  if (process.env.SBI_SELECTOR_ENABLED === 'true') {
    await performInitialSessionHydration(server)
  }

  loadSubmissionSchemaValidators()

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
