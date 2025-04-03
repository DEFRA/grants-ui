import plugin from '@defra/forms-engine-plugin'
import crumb from '@hapi/crumb'
import hapi from '@hapi/hapi'
import inert from '@hapi/inert'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from '~/src/config/config.js'
import { nunjucksConfig } from '~/src/config/nunjucks/nunjucks.js'
import { formsService } from '~/src/server/common/forms/services/form.js'
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
import LandParcelController from '~/src/server/land-grants/parcels/parcel.controller.js'
import ConfirmationPageController from '~/src/server/controllers/confirmation/controller.js'
import DeclarationPageController from '~/src/server/controllers/declaration/controller.js'
import { router } from './router.js'

const getViewPaths = () => {
  const currentFilePath = fileURLToPath(import.meta.url)
  const isRunningBuiltCode = currentFilePath.includes('.server')
  const basePath = isRunningBuiltCode ? '.server/server' : 'src/server'
  return [
    `${basePath}/land-grants/actions`,
    `${basePath}/land-grants/parcels`,
    `${basePath}/views`,
    `${basePath}/common/templates`,
    `${basePath}/common/components`
  ]
}

export async function createServer() {
  setupProxy()
  const server = hapi.server({
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        }
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
        name: config.get('session.cache.name'),
        engine: getCacheEngine(
          /** @type {Engine} */ (config.get('session.cache.engine'))
        )
      }
    ],
    state: {
      strictHeader: false
    }
  })

  await server.register({
    plugin,
    options: {
      services: {
        formsService,
        formSubmissionService
      },
      viewPaths: getViewPaths(),
      controllers: {
        ConfirmationPageController,
        DeclarationPageController,
        LandParcelController,
        LandActionsController
      }
    }
  })

  await server.register(inert)
  await server.register(crumb)

  await server.register([
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    sessionCache,
    nunjucksConfig,
    router
  ])

  server.ext('onPreResponse', catchAll)

  return server
}
