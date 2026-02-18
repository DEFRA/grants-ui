import path from 'node:path'
import nunjucks from 'nunjucks'
import hapiVision from '@hapi/vision'

import { config } from '~/src/config/config.js'
import { context } from './context/context.js'
import * as filters from './filters/filters.js'
import * as globals from './globals.js'

export const viewPaths = (() => {
  const serverDir = path.resolve(path.join(process.cwd(), 'src/server'))
  return [
    path.join(serverDir, 'views'),
    path.join(serverDir, 'auth/views'),
    path.join(serverDir, 'check-responses/views'),
    path.join(serverDir, 'details-page/views'),
    path.join(serverDir, 'common/components'),
    path.join(serverDir, 'common/templates'),
    path.join(serverDir, 'confirmation/views'),
    path.join(serverDir, 'cookies/views'),
    path.join(serverDir, 'declaration/views'),
    path.join(serverDir, 'home/views'),
    path.join(serverDir, 'land-grants/views'),
    path.join(serverDir, 'land-grants/components'),
    path.join(serverDir, 'non-land-grants/pigs-might-fly/views'),
    path.join(serverDir, 'non-land-grants/methane/views'),
    path.join(serverDir, 'score-results/views'),
    path.join(serverDir, 'task-list/views')
  ]
})()

const nunjucksEnvironment = nunjucks.configure(['node_modules/govuk-frontend/dist/', ...viewPaths], {
  autoescape: true,
  throwOnUndefined: false,
  trimBlocks: true,
  lstripBlocks: true,
  // @ts-expect-error convict config type is excessively deep for TS
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

nunjucksEnvironment.addGlobal('gaTrackingId', config.get('googleAnalytics.trackingId'))

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 * @import { ServerViewsConfiguration } from '@hapi/vision'
 */
