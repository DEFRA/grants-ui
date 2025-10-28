import { fileURLToPath } from 'node:url'
import path from 'node:path'
import nunjucks from 'nunjucks'
import hapiVision from '@hapi/vision'

import { config } from '~/src/config/config.js'
import { context } from './context/context.js'
import * as filters from './filters/filters.js'
import * as globals from './globals.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
export const grantsUiPaths = [
  path.resolve(dirname, '../../server/common/templates'),
  path.resolve(dirname, '../../server/common/components'),
  path.resolve(dirname, '../../server/land-grants/components')
]
const nunjucksEnvironment = nunjucks.configure(['node_modules/govuk-frontend/dist/', ...grantsUiPaths], {
  autoescape: true,
  throwOnUndefined: false,
  trimBlocks: true,
  lstripBlocks: true,
  watch: config.get('nunjucks.watch'),
  noCache: config.get('nunjucks.noCache')
})

/**
 * @satisfies {ServerRegisterPluginObject<ServerViewsConfiguration>}
 */
export const nunjucksConfig = {
  plugin: hapiVision,
  options: {
    engines: {
      njk: {
        /**
         * @param {string} src
         * @param {{ environment: typeof nunjucksEnvironment }} options
         * @returns {(options: ReturnType<Awaited<typeof context>>) => string}
         */
        compile(src, options) {
          const template = nunjucks.compile(src, options.environment)
          return (ctx) => template.render(ctx)
        }
      }
    },
    compileOptions: {
      environment: nunjucksEnvironment
    },
    relativeTo: path.resolve(process.cwd()),
    path: ['src/server/views', 'src/server'],
    isCached: config.get('isProduction'),
    context
  }
}

Object.entries(globals).forEach(([name, global]) => {
  nunjucksEnvironment.addGlobal(name, global)
})

Object.entries(filters).forEach(([name, filter]) => {
  nunjucksEnvironment.addFilter(name, filter)
})

nunjucksEnvironment.addGlobal('gaTrackingId', config.get('googleAnalytics.trackingId'))

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 * @import { ServerViewsConfiguration } from '@hapi/vision'
 */
