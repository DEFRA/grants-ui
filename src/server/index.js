import defraForms from '@defra/forms-engine-plugin'
import crumb from '@hapi/crumb'
import hapi from '@hapi/hapi'
import inert from '@hapi/inert'
import path from 'path'
import { config } from '~/src/config/config.js'
import { nunjucksConfig } from '~/src/config/nunjucks/nunjucks.js'
import { catchAll } from '~/src/server/common/helpers/errors.js'
import { requestLogger } from '~/src/server/common/helpers/logging/request-logger.js'
import { setupProxy } from '~/src/server/common/helpers/proxy/setup-proxy.js'
import { pulse } from '~/src/server/common/helpers/pulse.js'
import { requestTracing } from '~/src/server/common/helpers/request-tracing.js'
import { secureContext } from '~/src/server/common/helpers/secure-context/index.js'
import { getCacheEngine } from '~/src/server/common/helpers/session-cache/cache-engine.js'
import { sessionCache } from '~/src/server/common/helpers/session-cache/session-cache.js'
import LandParcelController from '~/src/server/controllers/land-parcel.js'
import landGrantsDefinition from '~/src/server/forms/find-funding-for-land-or-farms.json'
import { router } from './router.js'

// Form metadata
const now = new Date()
const user = {
  id: 'grants-user',
  displayName: 'Grants dev'
}
const author = {
  createdAt: now,
  createdBy: user,
  updatedAt: now,
  updatedBy: user
}

const metadata = {
  organisation: 'Defra',
  teamName: 'Grants',
  teamEmail: 'grants@defra.gov.uk',
  submissionGuidance: "Thanks for your submission, we'll be in touch",
  notificationEmail: 'cl-defra-tactical-grants-test-rpa-email@equalexperts.com',
  ...author,
  live: author
}

const landGrantsMetadata = {
  id: '5c67688f-3c61-4839-a6e1-d48b598257f1',
  slug: 'find-funding-for-land-or-farms',
  title: 'Find Funding for Land or Farms',
  ...metadata
}

const formsService = {
  getFormMetadata: function (slug) {
    console.log('alo??', { slug })
    switch (slug) {
      case landGrantsMetadata.slug:
        return Promise.resolve(landGrantsMetadata)
      default:
        throw Boom.notFound(`Form '${slug}' not found`)
    }
  },
  getFormDefinition: function (id, _state) {
    switch (id) {
      case landGrantsMetadata.id:
        return Promise.resolve(landGrantsDefinition)
      default:
        throw Boom.notFound(`Form '${id}' not found`)
    }
  }
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
    plugin: defraForms,
    options: {
      services: {
        formsService
      },
      controllers: {
        LandParcelController
      }
    }
  })

  // Defra Forms & dependencies
  // await server.register(pino)
  await server.register(inert)
  await server.register(crumb)
  // await server.register({
  //   plugin: yar,
  //   options: {
  //     cookieOptions: {
  //       password: config.get('session.cookie.password')
  //     }
  //   }
  // })

  await server.register([
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    sessionCache,
    nunjucksConfig,
    router // Register all the controllers/routes defined in src/server/router.js,
  ])

  server.ext('onPreResponse', catchAll)

  return server
}

/**
 * @import {Engine} from '~/src/server/common/helpers/session-cache/cache-engine.js'
 */
