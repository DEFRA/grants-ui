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
import SelectActionsForLandParcelPageController from '~/src/server/land-grants/controllers/select-actions-for-land-parcel-page.controller.js'
import LandParcelPageController from '~/src/server/land-grants/controllers/land-parcel-page.controller.js'
import SubmissionPageController from '~/src/server/land-grants/controllers/submission-page.controller.js'
import { tasklistBackButton } from '~/src/server/plugins/tasklist-back-button.js'
import { formatCurrency } from '../config/nunjucks/filters/format-currency.js'
import SectionEndController from './section-end/section-end.controller.js'
import { router } from './router.js'
import FlyingPigsSubmissionPageController from '~/src/server/non-land-grants/pigs-might-fly/controllers/pig-types-submission.controller.js'
import { PotentialFundingController } from '~/src/server/non-land-grants/pigs-might-fly/controllers/potential-funding.controller.js'
import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { getCacheKey } from './common/helpers/state/get-cache-key-helper.js'
import { fetchSavedStateFromApi } from './common/helpers/state/fetch-saved-state-helper.js'
import { persistStateToApi } from './common/helpers/state/persist-state-helper.js'

const SESSION_CACHE_NAME = 'session.cache.name'

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

const registerFormsPlugin = async (server, prefix = '') => {
  await server.register({
    plugin,
    options: {
      ...(prefix && { routes: { prefix } }),
      cacheName: config.get(SESSION_CACHE_NAME),
      baseUrl: config.get('baseUrl'),
      saveAndReturn: {
        keyGenerator: (request) => {
          const { userId, businessId, grantId } = getCacheKey(request)
          return `${userId}:${businessId}:${grantId}`
        },
        sessionHydrator: async (request) => {
          return fetchSavedStateFromApi(request)
        },
        sessionPersister: async (state, request) => {
          return persistStateToApi(state, request)
        }
      },
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
        SelectActionsForLandParcelPageController,
        LandActionsCheckPageController,
        SectionEndController,
        FlyingPigsSubmissionPageController,
        PotentialFundingController,
        SummaryPageController
      }
    }
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
