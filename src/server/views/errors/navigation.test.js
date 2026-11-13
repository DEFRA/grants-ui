import Hapi from '@hapi/hapi'
import { boomify } from '@hapi/boom'
import { load } from 'cheerio'
import { nunjucksConfig } from '~/src/config/nunjucks/nunjucks.js'
import { catchAll } from '~/src/server/common/helpers/errors.js'

describe('error page service navigation', () => {
  let server
  let appContext

  beforeAll(async () => {
    server = Hapi.server()
    await server.register(nunjucksConfig)
    server.ext('onPreResponse', catchAll)
    server.route({
      method: 'GET',
      path: '/{slug}/error/{status}',
      handler(request) {
        Object.assign(request.app, appContext)
        throw boomify(new Error('Test page error'), { statusCode: Number(request.params.status) })
      }
    })
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe.each(['model', 'stateWithDefinition', 'routingDefinition'])('with metadata from %s', (source) => {
    it.each([400, 401, 403, 404, 423, 429, 500, 503])(
      'renders the applications link and preserves HTTP %s',
      async (status) => {
        const definition = { metadata: { phase: 'public-beta', allowMultipleApplications: true } }
        appContext =
          source === 'model'
            ? { model: { def: definition } }
            : { [source]: Promise.resolve({ definition: { definition } }) }

        const response = await server.inject(`/test-grant/error/${status}`)
        const $ = load(response.payload)
        const $link = $('.govuk-service-navigation__list a')

        expect(response.statusCode).toBe(status)
        expect($('main h1')).toHaveLength(1)
        expect($link).toHaveLength(1)
        expect($link.text().trim()).toBe('Manage your applications')
        expect($link.attr('href')).toBe('/test-grant/applications')
        expect($link.attr('aria-current')).toBeUndefined()
        expect($('.govuk-header')).toHaveLength(1)
      }
    )
  })

  it.each([false, undefined, 'true'])(
    'omits the link unless multiple applications are explicitly enabled (%j)',
    async (enabled) => {
      appContext = { model: { def: { metadata: { allowMultipleApplications: enabled } } } }

      const response = await server.inject('/test-grant/error/500')

      expect(response.statusCode).toBe(500)
      expect(load(response.payload)('.govuk-service-navigation__list a')).toHaveLength(0)
    }
  )

  it('omits the link when no grant definition is available', async () => {
    appContext = {}

    const response = await server.inject('/test-grant/error/404')

    expect(response.statusCode).toBe(404)
    expect(load(response.payload)('.govuk-service-navigation__list a')).toHaveLength(0)
  })

  it('renders the error page when the definition lookup itself failed', async () => {
    const failure = Promise.reject(new Error('Definition lookup failed'))
    // The original loader has already consumed the failure before rendering.
    await failure.catch(() => undefined)
    appContext = { routingDefinition: failure }

    const response = await server.inject('/test-grant/error/503')
    const $ = load(response.payload)

    expect(response.statusCode).toBe(503)
    expect($('main h1').text().trim()).toBe('Sorry, the service is unavailable')
    expect($('.govuk-service-navigation__list a')).toHaveLength(0)
  })
})
