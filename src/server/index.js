import plugin from '@defra/forms-engine-plugin'
import Bell from '@hapi/bell'
import Cookie from '@hapi/cookie'
import crumb from '@hapi/crumb'
import h2o2 from '@hapi/h2o2'
import hapi from '@hapi/hapi'
import inert from '@hapi/inert'
import Scooter from '@hapi/scooter'

import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '~/src/config/config.js'
import { context } from '~/src/config/nunjucks/context/context.js'
import { grantsUiPaths, nunjucksConfig } from '~/src/config/nunjucks/nunjucks.js'
import auth from '~/src/plugins/auth.js'
import sso from '~/src/plugins/sso.js'
import { contentSecurityPolicy } from '~/src/plugins/content-security-policy.js'
import { formsStatusCallback } from '~/src/server/status/status-helper.js'
import CheckResponsesPageController from '~/src/server/check-responses/check-responses.controller.js'
import { formsService } from '~/src/server/common/forms/services/form.js'
import { outputService } from '~/src/server/common/forms/services/output.js'
import { loadSubmissionSchemaValidators } from '~/src/server/common/forms/services/submission.js'
import { catchAll } from '~/src/server/common/helpers/errors.js'
import { requestLogger } from '~/src/server/common/helpers/logging/request-logger.js'
import { setupProxy } from '~/src/server/common/helpers/proxy/setup-proxy.js'
import { pulse } from '~/src/server/common/helpers/pulse.js'
import { requestTracing } from '~/src/server/common/helpers/request-tracing.js'
import { secureContext } from '~/src/server/common/helpers/secure-context/index.js'
import { getCacheEngine } from '~/src/server/common/helpers/session-cache/cache-engine.js'
import { sessionCache } from '~/src/server/common/helpers/session-cache/session-cache.js'
import ConfirmationPageController from '~/src/server/confirmation/confirmation-page.controller.js'
import DeclarationPageController from '~/src/server/declaration/declaration-page.controller.js'
import ConfirmFarmDetailsController from '~/src/server/land-grants/controllers/confirm-farm-details.controller.js'
import LandActionsCheckPageController from '~/src/server/land-grants/controllers/land-actions-check-page.controller.js'
import SelectLandParcelPageController from '~/src/server/land-grants/controllers/select-land-parcel-page.controller.js'
import SelectLandActionsPageController from '~/src/server/land-grants/controllers/select-land-actions-page.controller.js'
import SubmissionPageController from '~/src/server/land-grants/controllers/submission-page.controller.js'
import FlyingPigsSubmissionPageController from '~/src/server/non-land-grants/pigs-might-fly/controllers/flying-pigs-submission-page.controller.js'
import { PotentialFundingController } from '~/src/server/non-land-grants/pigs-might-fly/controllers/potential-funding.controller.js'
import { tasklistBackButton } from '~/src/server/plugins/tasklist-back-button.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import { formatCurrency } from '../config/nunjucks/filters/format-currency.js'
import { StatePersistenceService } from './common/services/state-persistence/state-persistence.service.js'
import RemoveActionPageController from './land-grants/controllers/remove-action-page.controller.js'
import { router } from './router.js'
import SectionEndController from './section-end/section-end.controller.js'
import whitelist from '~/src/server/common/helpers/whitelist/whitelist.js'
import ConfirmMethaneDetailsController from '~/src/server/non-land-grants/methane/controllers/confirm-methane-details.controller.js'

const SESSION_CACHE_NAME = 'session.cache.name'

const getViewPaths = () => {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
  return [
    path.join(serverDir, 'views'),
    path.join(serverDir, 'auth/views'),
    path.join(serverDir, 'land-grants/views'),
    path.join(serverDir, 'non-land-grants/pigs-might-fly/views'),
    path.join(serverDir, 'non-land-grants/methane/views'),
    path.join(serverDir, 'about'),
    path.join(serverDir, 'home'),
    path.join(serverDir, 'home/views'),
    path.join(serverDir, 'error'),
    path.join(serverDir, 'confirmation/views'),
    path.join(serverDir, 'declaration/views'),
    path.join(serverDir, 'score-results/views'),
    path.join(serverDir, 'section-end/views'),
    path.join(serverDir, 'tasklist/views'),
    path.join(serverDir, 'check-responses/views'),
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
        mode: 'required',
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

/**
 *
 * @param {Server} server
 * @param {string} prefix
 */
const registerFormsPlugin = async (server, prefix = '') => {
  await server.register({
    plugin,
    options: {
      ...(prefix && { routes: { prefix } }),
      cache: new StatePersistenceService({ server }),
      baseUrl: config.get('baseUrl'),
      onRequest: formsStatusCallback,
      services: {
        formsService: await formsService(),
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
        SubmissionPageController,
        ConfirmFarmDetailsController,
        SelectLandParcelPageController,
        SelectLandActionsPageController,
        LandActionsCheckPageController,
        RemoveActionPageController,
        SectionEndController,
        FlyingPigsSubmissionPageController,
        PotentialFundingController,
        SummaryPageController,
        CheckResponsesPageController,
        ConfirmMethaneDetailsController
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
    h2o2,
    auth,
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    sessionCache,
    nunjucksConfig,
    sso,
    contentSecurityPolicy,
    whitelist
  ])

  await server.register([router])
}

const mockSessionData = async (request, log, LogCodes) => {
  try {
    const crypto = await import('node:crypto')
    const sessionId = request.state.sid?.sessionId || crypto.randomUUID()

    const sessionData = {
      isAuthenticated: true,
      sessionId,
      contactId: config.get('landGrants.customerReferenceNumber'),
      firstName: 'Anonymous',
      lastName: 'User',
      name: 'Anonymous User',
      role: 'user',
      scope: ['user'],
      sbi: `${sbiStore.get('sbi')}`,
      organisationId: `${sbiStore.get('sbi')}`,
      crn: String(config.get('landGrants.customerReferenceNumber')),
      currentRelationshipId: config.get('landGrants.mockSessionCurrentRelationshipId') || `${sbiStore.get('sbi')}1234`,
      relationships: [
        config.get('landGrants.mockSessionRelationships') ||
          `${sbiStore.get('sbi')}1234:${sbiStore.get('sbi')}:Farm ${sbiStore.get('sbi')}:1:External:0`
      ]
    }

    await request.server.app.cache.set(sessionId, sessionData)

    request.cookieAuth.set({ sessionId })

    log(
      LogCodes.AUTH.SIGN_IN_SUCCESS,
      {
        userId: 'anonymous-user-id',
        sessionId,
        role: 'user',
        scope: 'user',
        authMethod: 'auto-session'
      },
      request
    )
  } catch (error) {
    log(
      LogCodes.AUTH.SIGN_IN_FAILURE,
      {
        userId: 'unknown',
        error: `Failed to create auto-session: ${error.message}`,
        step: 'auto_session_creation_error',
        errorStack: error.stack
      },
      request
    )
  }
}

const handleMockDefraAuth = async (request, h, log, LogCodes) => {
  if (!config.get('defraId.enabled')) {
    if (h.request.path === '/auth/sign-out') {
      return h.redirect('/home').takeover()
    }

    await mockSessionData(request, log, LogCodes)

    if (h.request.path === '/auth/sign-in' && h.request.query.redirect) {
      return h.redirect(h.request.query.redirect).takeover()
    }
    if (h.request.path === '/auth/sign-in') {
      return h.redirect('/home').takeover()
    }
  }
  return h.continue
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
  await server.register(tasklistBackButton)

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
    /** @type {string[]} */
    const prev = request.yar.get('visitedSubSections') || []
    const entry = request?.paramsArray[0] || null

    if (entry && !prev.includes(entry)) {
      prev.push(entry)
    }

    request.yar.set('visitedSubSections', prev)

    return h.continue
  })

  // Create a server extension to handle session creation when defra-id is disabled
  server.ext('onPreAuth', async (request, h) => {
    return handleMockDefraAuth(request, h, log, LogCodes)
  })

  server.app['cache'] = server.cache({
    cache: config.get(SESSION_CACHE_NAME),
    segment: config.get('session.cookie.cache.segment'),
    expiresIn: config.get('session.cookie.cache.ttl')
  })

  server.app['cacheTemp'] = server.cache({
    cache: config.get(SESSION_CACHE_NAME),
    segment: 'tasklist-section-data',
    expiresIn: config.get('session.cache.ttl')
  })

  server.ext('onPreResponse', catchAll)

  return server
}

/**
 * @import { Engine } from '~/src/server/common/helpers/session-cache/cache-engine.js'
 * @import { Server } from '@hapi/hapi'
 */
