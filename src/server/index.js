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
import { nunjucksConfig } from '~/src/config/nunjucks/nunjucks.js'
// import auth from '~/src/plugins/auth.js'
import csp from '~/src/plugins/content-security-policy.js'
import sso from '~/src/plugins/sso.js'
import { formsService } from '~/src/server/common/forms/services/form.js'
import { outputService } from '~/src/server/common/forms/services/output.js'
import { formSubmissionService } from '~/src/server/common/forms/services/submission.js'
import { catchAll } from '~/src/server/common/helpers/errors.js'
import { requestLogger } from '~/src/server/common/helpers/logging/request-logger.js'
import { setupProxy } from '~/src/server/common/helpers/proxy/setup-proxy.js'
import { pulse } from '~/src/server/common/helpers/pulse.js'
import { requestTracing } from '~/src/server/common/helpers/request-tracing.js'
import { secureContext } from '~/src/server/common/helpers/secure-context/index.js'
import { getCacheEngine } from '~/src/server/common/helpers/session-cache/cache-engine.js'
import { sessionCache } from '~/src/server/common/helpers/session-cache/session-cache.js'
import LandActionsController from '~/src/server/land-grants/actions/actions.controller.js'
import LandParcelController from '~/src/server/land-grants/parcel/parcel.controller.js'
import SubmissionPageController from '~/src/server/land-grants/submission/submission.controller.js'
import ConfirmationPageController from '~/src/server/scoring/confirmation/confirmation.controller.js'
import DeclarationPageController from '~/src/server/scoring/declaration/declaration.controller.js'
import { formatCurrency } from '../config/nunjucks/filters/format-currency.js'
import { router } from './router.js'

const SESSION_CACHE_NAME = 'session.cache.name'

const getViewPaths = () => {
  const currentFilePath = fileURLToPath(import.meta.url)
  const isRunningBuiltCode = currentFilePath.includes('.server')
  const basePath = isRunningBuiltCode ? '.server/server' : 'src/server'
  return [
    `${basePath}/land-grants/actions`,
    `${basePath}/land-grants/parcel`,
    `${basePath}/land-grants/submission`,
    `${basePath}/scoring/views`,
    `${basePath}/scoring/declaration`,
    `${basePath}/scoring/confirmation`,
    `${basePath}/common/templates`
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
        formsService,
        formSubmissionService,
        outputService
      },
      filters: {
        formatCurrency
      },
      viewPaths: getViewPaths(),
      controllers: {
        ConfirmationPageController,
        DeclarationPageController,
        SubmissionPageController,
        LandParcelController,
        LandActionsController
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
    router,
    sso
  ])
}

export async function createServer() {
  setupProxy()
  const server = createHapiServer()

  await registerPlugins(server)
  await registerFormsPlugin(server)

  server.app.cache = server.cache({
    cache: config.get(SESSION_CACHE_NAME),
    segment: 'test-segment', // config.get('session.cache.segment')
    expiresIn: config.get('session.cache.ttl')
  })

  server.ext('onPreResponse', catchAll)

  return server
}
