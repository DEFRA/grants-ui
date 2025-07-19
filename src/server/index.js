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
import auth from '~/src/plugins/auth.js'
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

const SESSION_CACHE_NAME = 'session.cache.name'

const getViewPaths = async () => {
  const currentFilePath = fileURLToPath(import.meta.url)
  const isRunningBuiltCode = currentFilePath.includes('.server')

  // For Docker/production, we need to use the working directory, not relative to the built file
  const basePath = isRunningBuiltCode
    ? path.resolve(process.cwd(), 'src/server') // Docker working directory + src/server
    : path.resolve(path.dirname(currentFilePath))

  const viewPaths = [
    path.join(basePath, 'non-land-grants/pigs-might-fly/views'),
    path.join(basePath, 'land-grants/views'),
    path.join(basePath, 'views'),
    ...grantsUiPaths
  ]

  // Debug logging for view path resolution using structured logging
  const { log, LogCodes } = await import(
    '~/src/server/common/helpers/logging/log.js'
  )

  log(LogCodes.SYSTEM.VIEW_DEBUG, {
    currentFilePath,
    isRunningBuiltCode,
    basePath,
    resolvedViewPaths: viewPaths,
    processWorkingDir: process.cwd()
  })

  // Log runtime environment information
  log(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
    configType: 'Runtime_Environment',
    configValues: {
      NODE_ENV: process.env.NODE_ENV ?? 'NOT_SET',
      isDockerEnvironment: process.cwd() === '/home/node',
      currentWorkingDirectory: process.cwd(),
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      __dirname_equivalent: path.dirname(currentFilePath),
      serverIndexLocation: currentFilePath
    }
  })

  // Check if view files actually exist using structured logging
  const fs = await import('fs')
  viewPaths.forEach((viewPath, index) => {
    try {
      const exists = fs.existsSync(viewPath)
      log(LogCodes.SYSTEM.VIEW_PATH_CHECK, {
        index,
        path: viewPath,
        exists,
        isAbsolute: path.isAbsolute(viewPath)
      })
    } catch (error) {
      log(LogCodes.SYSTEM.SERVER_ERROR, {
        error: `View path check failed for ${viewPath}: ${error.message}`
      })
    }
  })

  return viewPaths
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

const registerFormsPlugin = async (server, prefix = '') => {
  await server.register({
    plugin,
    options: {
      ...(prefix && { routes: { prefix } }),
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
        paths: await getViewPaths()
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

const registerPlugins = async (server) => {
  await server.register([
    inert,
    crumb,
    Bell,
    Cookie,
    Scooter,
    csp,
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
