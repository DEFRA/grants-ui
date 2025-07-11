import plugin from '@defra/forms-engine-plugin'
import Bell from '@hapi/bell'
import Cookie from '@hapi/cookie'
import crumb from '@hapi/crumb'
import hapi from '@hapi/hapi'
import inert from '@hapi/inert'
import Scooter from '@hapi/scooter'

import path from 'path'
import { fileURLToPath } from 'url'
import { config } from '~/src/config/config.js'
import { context } from '~/src/config/nunjucks/context/context.js'
import {
  grantsUiPaths,
  nunjucksConfig
} from '~/src/config/nunjucks/nunjucks.js'
// import auth from '~/src/plugins/auth.js'
import csp from '~/src/plugins/content-security-policy.js'
import sso from '~/src/plugins/sso.js'
import { formsService } from '~/src/server/common/forms/services/form.js'
import { outputService } from '~/src/server/common/forms/services/output.js'
import {
  formSubmissionService,
  loadSubmissionSchemaValidators
} from '~/src/server/common/forms/services/submission.js'
import { catchAll } from '~/src/server/common/helpers/errors.js'
import { requestLogger } from '~/src/server/common/helpers/logging/request-logger.js'
import { setupProxy } from '~/src/server/common/helpers/proxy/setup-proxy.js'
import { pulse } from '~/src/server/common/helpers/pulse.js'
import { requestTracing } from '~/src/server/common/helpers/request-tracing.js'
import { secureContext } from '~/src/server/common/helpers/secure-context/index.js'
import { getCacheEngine } from '~/src/server/common/helpers/session-cache/cache-engine.js'
import { sessionCache } from '~/src/server/common/helpers/session-cache/session-cache.js'
import ConfirmationPageController from '~/src/server/controllers/confirmation/controller.js'
import DeclarationPageController from '~/src/server/controllers/declaration/controller.js'
import CheckAnswersPageController from '~/src/server/land-grants/controllers/check-answers-page.controller.js'
import ConfirmFarmDetailsController from '~/src/server/land-grants/controllers/confirm-farm-details.controller.js'
import LandActionsCheckPageController from '~/src/server/land-grants/controllers/land-actions-check-page.controller.js'
import LandActionsPageController from '~/src/server/land-grants/controllers/land-actions-page.controller.js'
import LandParcelPageController from '~/src/server/land-grants/controllers/land-parcel-page.controller.js'
import SubmissionPageController from '~/src/server/land-grants/controllers/submission-page.controller.js'
import { tasklistBackButton } from '~/src/server/plugins/tasklist-back-button.js'
import { formatCurrency } from '../config/nunjucks/filters/format-currency.js'
import SectionEndController from './controllers/section-end/section-end-controller.js'
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
        engine: getCacheEngine(
          /** @type {Engine} */ (config.get('session.cache.engine'))
        )
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
  warn:
    serverLogger.warn?.bind(serverLogger) ||
    serverLogger.info.bind(serverLogger),
  debug:
    serverLogger.debug?.bind(serverLogger) ||
    serverLogger.info.bind(serverLogger)
})

const getIdentity = (request) => {
  const sbi = sbiStore.get('sbi')

  const { userId, businessId, grantId } = {
    userId: `user_${sbi}`,
    businessId: `business_${sbi}`,
    grantId: `grant_${sbi}`
  }

  if (!request.auth.credentials) {
    request.auth.credentials = {
      userId,
      businessId,
      grantId
    }
  }

  if (!userId || !businessId || !grantId) {
    throw new Error('Missing identity')
  }

  return { userId, businessId, grantId }
}

async function fetchSavedStateFromApi(request) {
  if (!GRANTS_UI_BACKEND_ENDPOINT) {
    request.logger.warn('Backend not configured - skipping API call')
    return null
  }

  const { userId, businessId, grantId } = getIdentity(request)
  const apiUrl = `${GRANTS_UI_BACKEND_ENDPOINT}/state/?userId=${userId}&businessId=${businessId}&grantId=${grantId}`

  request.logger.info(
    `Fetching state from backend for identity: ${userId}:${businessId}:${grantId}`
  )

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
    request.logger.error(
      ['fetch-saved-state'],
      'Failed to fetch saved state from API',
      err
    )
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
  const {
    pathname = '/server-startup',
    method = 'GET',
    logContext = 'session hydration'
  } = options

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

const registerPlugins = async (server) => {
  await server.register([router])

  await server.register([
    inert,
    crumb,
    Bell,
    Cookie,
    Scooter,
    csp,
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

  await performInitialSessionHydration(server)

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
