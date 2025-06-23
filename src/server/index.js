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
import { tasklistBackButton } from '~/src/server/plugins/tasklist-back-button.js'
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
import LandActionsPageController from '~/src/server/land-grants/controllers/land-actions-page.controller.js'
import LandActionsCheckPageController from '~/src/server/land-grants/controllers/land-actions-check-page.controller.js'
import LandParcelPageController from '~/src/server/land-grants/controllers/land-parcel-page.controller.js'
import SubmissionPageController from '~/src/server/land-grants/controllers/submission-page.controller.js'
import SectionEndController from './controllers/section-end/section-end-controller.js'
import { formatCurrency } from '../config/nunjucks/filters/format-currency.js'
import { router } from './router.js'
import { PotentialFundingController } from '~/src/server/non-land-grants/pigs-might-fly/controllers/pig-types-summary.controller.js'

const SESSION_CACHE_NAME = 'session.cache.name'

const getViewPaths = () => {
  const currentFilePath = fileURLToPath(import.meta.url)
  const isRunningBuiltCode = currentFilePath.includes('.server')
  const basePath = isRunningBuiltCode ? '.server/server' : 'src/server'
  return [
    `${basePath}/land-grants/views`,
    `${basePath}/views`,
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

const registerFormsPlugin = async (server) => {
  await server.register({
    plugin,
    options: {
      cacheName: config.get(SESSION_CACHE_NAME),
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
        SubmissionPageController,
        LandParcelPageController,
        LandActionsPageController,
        LandActionsCheckPageController,
        SectionEndController,
        PotentialFundingController
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
    // auth,
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    sessionCache,
    nunjucksConfig,
    tasklistBackButton,
    router,
    sso
  ])
}

export async function createServer() {
  setupProxy()
  const server = createHapiServer()

  await registerPlugins(server)
  await registerFormsPlugin(server)
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
