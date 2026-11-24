import hapi from '@hapi/hapi'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { configState, mockHapiResponseToolkit } from '~/src/__mocks__'
import { logHandledError } from '../common/helpers/logging/handled-error.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { fetchLatestDefinitionFromApi } from '../common/helpers/state/fetch-saved-state-helper.js'
import { shutter } from './index.js'
import { shutterHandler } from './shutter.js'

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigWithState } = await import('~/src/__mocks__/config-mocks.js')
  return mockConfigWithState({
    defaults: {
      'shutter.enabledSlugs': ['woodland'],
      'agreements.baseUrl': '/agreement',
      'externalLinks.sfd.enabled': false,
      'externalLinks.sfd.homeUrl': 'https://sfd.example/home'
    }
  })
})

vi.mock('../common/helpers/state/fetch-saved-state-helper.js', () => ({
  fetchLatestDefinitionFromApi: vi.fn()
}))

vi.mock('../common/helpers/logging/handled-error.js', () => ({
  logHandledError: vi.fn()
}))

vi.mock('../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__/logger-mocks.js')
  return mockLogHelper()
})

const shutterHtml = '<p class="govuk-body">Back on <a href="https://example.gov.uk">Monday</a>.</p>'

const buildRequest = ({ slug = 'woodland', isAuthenticated = true, method = 'get' } = {}) => ({
  method,
  route: { path: '/{slug}/{path}/{itemId?}' },
  params: slug ? { slug } : {},
  query: {},
  auth: { isAuthenticated, credentials: { currentRelationshipId: 'REL123' } }
})

const buildAgreementsRequest = ({ grant, ref, session } = {}) => ({
  method: 'get',
  app: {},
  route: { path: '/agreement/{path*}' },
  params: { path: 'review-offer' },
  query: { ...(grant && { grant }), ...(ref && { ref }) },
  yar: { get: vi.fn().mockReturnValue(session ?? null) },
  auth: { isAuthenticated: true, credentials: { sbi: '106000001', currentRelationshipId: 'REL123' } }
})

const renderedView = (h) => {
  const response = h.view.mock.results[0].value
  return { view: h.view.mock.calls[0], code: response.code, takeover: response.takeover }
}

describe('shutterHandler', () => {
  let h

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    configState.reset()
    fetchLatestDefinitionFromApi.mockResolvedValue({ definition: { name: 'Woodland Management Plan' } })
    h = mockHapiResponseToolkit()
    const response = { code: vi.fn(), takeover: vi.fn() }
    response.code.mockReturnValue(response)
    response.takeover.mockReturnValue(response)
    h.view = vi.fn().mockReturnValue(response)
  })

  test.each([
    ['a signed-out user', buildRequest({ isAuthenticated: false })],
    ['a route without a grant', buildRequest({ slug: null })],
    ['a grant that is not shuttered', buildRequest({ slug: 'water-management' })]
  ])('continues for %s without loading a definition', async (_, request) => {
    expect(await shutterHandler(request, h)).toBe(h.continue)
    expect(fetchLatestDefinitionFromApi).not.toHaveBeenCalled()
  })

  test('continues for every grant when no slugs are shuttered', async () => {
    configState.set('shutter.enabledSlugs', [])

    expect(await shutterHandler(buildRequest(), h)).toBe(h.continue)
  })

  test.each(['get', 'post'])('shows the shutter page for a %s to a shuttered grant', async (method) => {
    vi.stubEnv('SHUTTER_ENABLED_CONTENT_WOODLAND', shutterHtml)

    await shutterHandler(buildRequest({ method }), h)

    const { view, code, takeover } = renderedView(h)
    expect(view).toEqual([
      'grant-shuttered',
      { grantName: 'Woodland Management Plan', html: shutterHtml, falsUrl: '/' }
    ])
    expect(code).toHaveBeenCalledWith(503)
    expect(takeover).toHaveBeenCalled()
  })

  test('matches slugs listed with spaces around the commas', async () => {
    configState.set('shutter.enabledSlugs', ['water-management', ' woodland '])

    await shutterHandler(buildRequest(), h)

    expect(renderedView(h).view[0]).toBe('grant-shuttered')
  })

  test('reads the content for a hyphenated slug from an underscored variable', async () => {
    configState.set('shutter.enabledSlugs', ['water-management'])
    vi.stubEnv('SHUTTER_ENABLED_CONTENT_WATER_MANAGEMENT', shutterHtml)

    await shutterHandler(buildRequest({ slug: 'water-management' }), h)

    expect(renderedView(h).view[1].html).toBe(shutterHtml)
  })

  test.each([
    ['unset', undefined],
    ['blank', '  ']
  ])('shows no optional content when its variable is %s', async (_, content) => {
    vi.stubEnv('SHUTTER_ENABLED_CONTENT_WOODLAND', content)

    await shutterHandler(buildRequest(), h)

    expect(renderedView(h).view[1].html).toBeUndefined()
  })

  test('still shows the shutter page, without the grant name, when the definition cannot be loaded', async () => {
    const error = new Error('Backend down')
    fetchLatestDefinitionFromApi.mockRejectedValue(error)
    const request = buildRequest({ method: 'post' })

    await shutterHandler(request, h)

    const { view, code } = renderedView(h)
    expect(view[1].grantName).toBeUndefined()
    expect(code).toHaveBeenCalledWith(503)
    expect(logHandledError).toHaveBeenCalledWith(error, request, {
      fallbackCode: LogCodes.SYSTEM.SHUTTER_GRANT_NAME_UNAVAILABLE,
      fallbackDetails: { grantCode: 'woodland' }
    })
  })

  describe('agreements proxy', () => {
    const woodlandSession = { grantCode: 'woodland', sbi: '106000001' }
    const waterManagementSession = { grantCode: 'water-management', sbi: '106000001' }

    test.each([
      ['named on a multi-application URL', { grant: 'woodland', ref: 'WMP-123-456', session: waterManagementSession }],
      ['held in session', { session: woodlandSession }],
      ['held in session, with a ref but no grant on the URL', { ref: 'WMP-123-456', session: woodlandSession }],
      ['held in session, with a grant on the URL but no ref', { grant: 'water-management', session: woodlandSession }]
    ])('shows the shutter page when the agreement acted on is for a shuttered grant %s', async (_, context) => {
      await shutterHandler(buildAgreementsRequest(context), h)

      expect(renderedView(h).view[0]).toBe('grant-shuttered')
      expect(fetchLatestDefinitionFromApi).toHaveBeenCalledWith('woodland')
    })

    test.each([
      [
        'a live grant named on a multi-application URL while the session holds a shuttered one',
        { grant: 'water-management', ref: 'WM-123-456', session: woodlandSession }
      ],
      ['a live grant held in session', { session: waterManagementSession }],
      [
        'a live grant held in session, with a shuttered grant but no ref on the URL',
        { grant: 'woodland', session: waterManagementSession }
      ],
      ["a shuttered grant held in another business's session", { session: { grantCode: 'woodland', sbi: '999' } }],
      ['no known grant', {}]
    ])('continues for %s', async (_, context) => {
      expect(await shutterHandler(buildAgreementsRequest(context), h)).toBe(h.continue)
    })
  })

  describe('Farm and Land Service link', () => {
    beforeEach(() => {
      configState.set('externalLinks.sfd.enabled', true)
    })

    test('links to the SFD home page for the current organisation when SFD is enabled', async () => {
      await shutterHandler(buildRequest(), h)

      expect(renderedView(h).view[1].falsUrl).toBe('https://sfd.example/home?ssoOrgId=REL123')
      expect(log).not.toHaveBeenCalled()
    })

    test('links to the SFD home page without an organisation when none is selected', async () => {
      const request = buildRequest()
      request.auth.credentials = {}

      await shutterHandler(request, h)

      expect(renderedView(h).view[1].falsUrl).toBe('https://sfd.example/home')
    })

    test.each([
      [undefined, ''],
      ['', ''],
      ['not a url', 'not a url'],
      ['javascript:alert(1)', 'javascript:alert(1)']
    ])('links to the Grants UI home page and logs when the SFD home URL is %j', async (configured, logged) => {
      configState.set('externalLinks.sfd.homeUrl', configured)
      const request = buildRequest()

      await shutterHandler(request, h)

      expect(renderedView(h).view[1].falsUrl).toBe('/')
      expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.SFD_HOME_URL_MISSING_ON_SHUTTER, { homeUrl: logged }, request)
    })
  })
})

describe('shutter plugin', () => {
  let server
  const laterPostAuth = vi.fn((_request, h) => h.continue)
  const handler = vi.fn(() => 'saved')

  beforeEach(async () => {
    vi.clearAllMocks()
    configState.reset()
    server = hapi.server()
    server.auth.scheme('test', () => ({
      authenticate: (_request, h) => h.authenticated({ credentials: { currentRelationshipId: 'REL123' } })
    }))
    server.auth.strategy('test', 'test')
    server.auth.default('test')
    server.decorate('toolkit', 'view', function (template) {
      return this.response(template)
    })
    await server.register(shutter)
    server.ext('onPostAuth', laterPostAuth)
    server.route({ method: 'POST', path: '/{slug}/{path}', handler })
  })

  afterEach(() => server.stop())

  test('stops a shuttered POST before later lifecycle steps or the handler can open or save state', async () => {
    const response = await server.inject({ method: 'POST', url: '/woodland/business-details' })

    expect(response.statusCode).toBe(503)
    expect(response.payload).toBe('grant-shuttered')
    expect(laterPostAuth).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  test('logs the shuttered slugs at startup', () => {
    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.GRANTS_SHUTTERED, { slugs: ['woodland'] })
  })

  test('lets a POST to a live grant through', async () => {
    const response = await server.inject({ method: 'POST', url: '/water-management/business-details' })

    expect(response.payload).toBe('saved')
    expect(laterPostAuth).toHaveBeenCalled()
  })
})
