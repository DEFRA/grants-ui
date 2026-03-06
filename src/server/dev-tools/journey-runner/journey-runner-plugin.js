import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, dirname, resolve } from 'node:path'

const pluginDir = dirname(fileURLToPath(import.meta.url))
const enginePath = resolve(pluginDir, './runner-engine.js')
const journeysDir = resolve(pluginDir, './journeys')

const SLUG_PATTERN = /^[a-z0-9-]+$/

/**
 * Dev-only plugin that serves the journey runner script at
 * /dev/journey-runner/{journey}.js and injects `journeySlug`
 * into the Nunjucks view context so the template can build the src URL.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const journeyRunnerPlugin = {
  plugin: {
    name: 'journey-runner',
    register(server) {
      server.ext('onPreResponse', (request, h) => {
        const response = /** @type {*} */ (request.response)
        if (response.variety === 'view') {
          const slug = request.path.split('/').find(Boolean) ?? ''
          response.source.context = {
            ...response.source.context,
            journeySlug: slug
          }
        }
        return h.continue
      })

      server.route({
        method: 'GET',
        path: '/dev/journey-runner/{journey}.js',
        options: {
          auth: false
        },
        handler(request, h) {
          if (!existsSync(enginePath)) {
            return h
              .response('// journey-runner engine not found')
              .type('application/javascript')
              .header('Cache-Control', 'no-store')
          }

          const slug = request.params.journey
          if (!SLUG_PATTERN.test(slug)) {
            return h
              .response('// invalid journey slug')
              .type('application/javascript')
              .header('Cache-Control', 'no-store')
          }

          const journeyPath = resolve(journeysDir, slug + '.json')
          if (basename(journeyPath) !== slug + '.json' || !existsSync(journeyPath)) {
            return h
              .response('// no journey config for "' + slug + '"')
              .type('application/javascript')
              .header('Cache-Control', 'no-store')
          }

          const json = readFileSync(journeyPath, 'utf-8')
          const engine = readFileSync(enginePath, 'utf-8')

          return h
            .response('globalThis.__journeySteps = ' + json + ';\n' + engine)
            .type('application/javascript')
            .header('Cache-Control', 'no-store')
        }
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
