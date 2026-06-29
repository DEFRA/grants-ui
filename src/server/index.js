import plugin from '@defra/forms-engine-plugin'
import Bell from '@hapi/bell'
import Cookie from '@hapi/cookie'
import crumb from '@hapi/crumb'
import h2o2 from '@hapi/h2o2'
import hapi from '@hapi/hapi'

import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import path from 'node:path'
import { config } from '~/src/config/config.js'
import { context } from '~/src/config/nunjucks/context/context.js'
import { nunjucksConfig, viewPaths } from '~/src/config/nunjucks/nunjucks.js'
import auth from '~/src/plugins/auth.js'
import { rateLimitPlugin } from '~/src/plugins/rate-limit.js'
import sso from '~/src/plugins/sso.js'
import { contentSecurityPolicy } from '~/src/plugins/content-security-policy.js'
import CheckResponsesPageController from '~/src/server/check-responses/check-responses.controller.js'
import { formsService } from '~/src/server/common/forms/services/form.js'
import { outputService } from '~/src/server/common/forms/services/output.js'
import { loadSubmissionSchemaValidators } from '~/src/server/common/forms/services/submission.js'
import { catchAll } from '~/src/server/common/helpers/errors.js'
import { requestLogger } from '~/src/server/common/helpers/logging/request-logger.js'
import { setupProxy } from '~/src/server/common/helpers/proxy/setup-proxy.js'
import { pulse } from '~/src/server/common/helpers/pulse.js'
import { updateVisitedSections } from '~/src/server/common/helpers/visited-sections-guard.js'
import { requestTracing } from '~/src/server/common/helpers/request-tracing.js'
import { secureContext } from '~/src/server/common/helpers/secure-context/index.js'
import { getCacheEngine } from '~/src/server/common/helpers/session-cache/cache-engine.js'
import { sessionCache } from '~/src/server/common/helpers/session-cache/session-cache.js'
import ConfirmationPageController from '~/src/server/confirmation/confirmation-page.controller.js'
import PrintSubmittedApplicationController from '~/src/server/print-submitted-application/print-submitted-application.controller.js'
import DeclarationPageController from '~/src/server/declaration/declaration-page.controller.js'
import ConfirmFarmDetailsController from '~/src/server/land-grants/controllers/confirm-farm-details.controller.js'
import PaymentPageController from '~/src/server/payment/controllers/payment-page.controller.js'
import SelectLandParcelPageController from '~/src/server/land-grants/controllers/select-land-parcel-page.controller.js'
import SelectLandActionsPageController from '~/src/server/land-grants/controllers/select-land-actions-page.controller.js'
import SubmissionPageController from '~/src/server/land-grants/controllers/submission-page.controller.js'
import LandGrantsGenericPageController from '~/src/server/land-grants/controllers/land-grants-generic-page.controller.js'
import FlyingPigsSubmissionPageController from '~/src/server/non-land-grants/pigs-might-fly/controllers/flying-pigs-submission-page.controller.js'
import ConsentPageController from '~/src/server/land-grants/controllers/consent-page.controller.js'
import RemoveActionPageController from '~/src/server/land-grants/controllers/remove-action-page.controller.js'
import { PotentialFundingController } from '~/src/server/non-land-grants/pigs-might-fly/controllers/potential-funding.controller.js'
import { formatCurrency } from '../config/nunjucks/filters/format-currency.js'
import { StatePersistenceService } from './common/services/state-persistence/state-persistence.service.js'
import { router } from './router.js'
import allowlist from '~/src/server/common/helpers/allowlist/allowlist.js'
import whitelist from '~/src/server/common/helpers/whitelist/whitelist.js'
import ConfirmMethaneDetailsController from '~/src/server/non-land-grants/methane/controllers/confirm-methane-details.controller.js'
import TaskListPageController from '~/src/server/task-list/task-list-page.controller.js'
import TaskPageController from '~/src/server/task-list/task-page.controller.js'
import WoodlandHectaresPageController from '~/src/server/woodland/woodland-hectares-page.controller.js'
import TerminalPageController from '~/src/server/task-list/terminal-page.controller.js'
import LandingPageController from '~/src/server/task-list/landing-page.controller.js'
import CheckDetailsController from '~/src/server/details-page/check-details.controller.js'
import CommonSelectLandParcelPageController from './land-grants/common/common-select-parcel/common-select-land-parcel-page.controller.js'
import MapSelectPageController from '~/src/server/common/map/map-select-page.controller.js'
import MapSubmissionPageController from '~/src/server/common/map/map-submission-page.controller.js'
import permissions from '../plugins/permissions.js'
import { formsRequestPipeline } from './common/request-pipeline/forms-request-pipeline.js'
import { auditPublisher } from '~/src/server/common/helpers/audit/audit.js'
import { bindRequestContext, getStateWithDefinition } from './common/helpers/state/state-with-definition-context.js'

const SESSION_CACHE_NAME = 'session.cache.name'

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
  const formService = await formsService()
  await server.register({
    plugin: /** @type {import('@hapi/hapi').Plugin<any>} */ (/** @type {unknown} */ (plugin)),
    options: {
      ...(prefix && { routes: { prefix } }),
      cache: new StatePersistenceService({ server }),
      baseUrl: config.get('baseUrl'),
      onRequest: formsRequestPipeline,
      services: {
        formsService: formService,
        outputService
      },
      filters: {
        formatCurrency
      },
      nunjucks: {
        baseLayoutPath: 'layouts/dxt-form.njk',
        paths: viewPaths
      },
      viewContext: context,
      controllers: {
        ConfirmationPageController,
        PrintSubmittedApplicationController,
        DeclarationPageController,
        SubmissionPageController,
        LandGrantsGenericPageController,
        ConfirmFarmDetailsController,
        SelectLandParcelPageController,
        CommonSelectLandParcelPageController,
        SelectLandActionsPageController,
        PaymentPageController,
        RemoveActionPageController,
        ConsentPageController,
        FlyingPigsSubmissionPageController,
        PotentialFundingController,
        SummaryPageController,
        CheckResponsesPageController,
        ConfirmMethaneDetailsController,
        TaskListPageController,
        TaskPageController,
        TerminalPageController,
        LandingPageController,
        CheckDetailsController,
        WoodlandHectaresPageController,
        MapSelectPageController,
        MapSubmissionPageController
      }
    }
  })
  server.method('getFormService', () => formService)
}

const registerPlugins = async (server) => {
  await server.register([
    crumb,
    Bell,
    Cookie,
    h2o2,
    // requestLogger (hapi-pino) decorates `server.logger`, which secureContext uses.
    requestLogger,
    // secureContext patches tls.createSecureContext to load CDP TRUSTSTORE_ CAs.
    // It must register before `auth`, whose registration performs the OIDC well-known
    // fetch over the egress proxy — global-agent v4 validates that TLS connection
    // (rejectUnauthorized: true), so the CDP CAs must be trusted before the fetch runs.
    secureContext,
    auth,
    rateLimitPlugin,
    requestTracing,
    pulse,
    sessionCache,
    nunjucksConfig,
    sso,
    permissions,
    contentSecurityPolicy,
    allowlist,
    whitelist,
    auditPublisher
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

  // Bind the live request to an AsyncLocalStorage context for the WHOLE request
  // lifecycle (route prerequisites, handler and onPreResponse). The
  // forms-engine-plugin resolves backend-sourced form definitions through a
  // request-less `getFormDefinition(id, state)` call, so it can only reach
  // `request.app` by recovering the request from this context.
  server.ext('onRequest', (request, h) => {
    bindRequestContext(request)
    return h.continue
  })

  // Prime the combined form-definition + state response once per request, before
  // the forms-engine-plugin resolves the form model. Runs after auth (so sbi/owner
  // are known) so the request-less form-definition path and getState can both
  // reuse the single backend call.
  server.ext('onPostAuth', async (request, h) => {
    const slug = request.params?.slug
    if (slug && request.auth?.isAuthenticated && request.auth?.credentials?.contactId) {
      try {
        await getStateWithDefinition(request)
      } catch {
        // Surfaced later by getState / the definition loader with full context.
      }
    }
    return h.continue
  })

  server.ext('onPreHandler', (request, h) => {
    /** @type {string[]} */
    const visitedSections = request.yar.get('visitedSubSections') || []
    const currentSectionId = request?.paramsArray[0] || null

    const updatedSections = updateVisitedSections(visitedSections, currentSectionId)
    request.yar.set('visitedSubSections', updatedSections)

    return h.continue
  })

  server.app['cache'] = server.cache({
    cache: config.get(SESSION_CACHE_NAME),
    segment: config.get('session.cookie.cache.segment'),
    expiresIn: config.get('session.cookie.cache.ttl')
  })

  server.ext('onPreResponse', catchAll)

  return server
}

/**
 * @import { Engine } from '~/src/server/common/helpers/session-cache/cache-engine.js'
 * @import { Server } from '@hapi/hapi'
 */
