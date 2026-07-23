import path from 'node:path'
import nunjucks from 'nunjucks'
import hapiVision from '@hapi/vision'

import { config } from '~/src/config/config.js'
import { context } from './context/context.js'
import * as filters from './filters/filters.js'
import * as globals from './globals.js'
import { govukFrontendPath, viewPaths } from './view-paths.js'

export { viewPaths }

// The engine views path makes the plugin's partials (e.g. partials/components.html,
// imported by check-details) resolvable when app routes render engine-styled views
// outside the plugin's own nunjucks environment (e.g. the /dev demo pages).
const nunjucksEnvironment = nunjucks.configure(
  [govukFrontendPath, 'node_modules/@defra/forms-engine-plugin/.server/server/plugins/engine/views/', ...viewPaths],
  {
    autoescape: true,
    throwOnUndefined: false,
    trimBlocks: true,
    lstripBlocks: true,
    watch: config.get('nunjucks.watch'),
    noCache: config.get('nunjucks.noCache')
  }
)

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
    path: viewPaths,
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

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 * @import { ServerViewsConfiguration } from '@hapi/vision'
 */
