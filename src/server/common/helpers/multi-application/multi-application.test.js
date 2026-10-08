import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import multiApplication from './multi-application.js'
import { multiApplicationRedirect } from '../../request-pipeline/redirects/multi-application-redirect.js'
import { mockHapiRequest, mockHapiResponseToolkit, mockHapiServer } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('../../request-pipeline/redirects/multi-application-redirect.js', () => ({
  multiApplicationRedirect: vi.fn()
}))

const FORMS_ENGINE_PLUGIN_NAME = '@defra/forms-engine-plugin'

const registerAndGetHandler = (server) => {
  multiApplication.plugin.register(server)
  return server.ext.mock.calls[0][1]
}

describe('multiApplication plugin', () => {
  let server
  let h

  beforeEach(() => {
    vi.clearAllMocks()
    server = mockHapiServer()
    h = mockHapiResponseToolkit()
    multiApplicationRedirect.mockResolvedValue(h.continue)
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('registers an onPostAuth extension', () => {
    multiApplication.plugin.register(server)
    expect(server.ext).toHaveBeenCalledWith('onPostAuth', expect.any(Function))
  })

  it('continues when request is not authenticated', async () => {
    const handler = registerAndGetHandler(server)
    const request = mockHapiRequest({ params: { slug: 'test-grant' }, auth: { isAuthenticated: false } })

    const result = await handler(request, h)

    expect(result).toBe(h.continue)
    expect(multiApplicationRedirect).not.toHaveBeenCalled()
  })

  it('continues when authenticated but request has no slug (non-journey route)', async () => {
    const handler = registerAndGetHandler(server)
    const request = mockHapiRequest({
      params: {},
      auth: { isAuthenticated: true, credentials: { contactId: 'c1' } }
    })

    const result = await handler(request, h)

    expect(result).toBe(h.continue)
    expect(multiApplicationRedirect).not.toHaveBeenCalled()
  })

  it('continues when authenticated but request has no contactId', async () => {
    const handler = registerAndGetHandler(server)
    const request = mockHapiRequest({
      params: { slug: 'test-grant' },
      auth: { isAuthenticated: true, credentials: {} }
    })

    const result = await handler(request, h)

    expect(result).toBe(h.continue)
    expect(multiApplicationRedirect).not.toHaveBeenCalled()
  })

  it('delegates to multiApplicationRedirect for a route registered in the forms-engine-plugin realm', async () => {
    const handler = registerAndGetHandler(server)
    const request = mockHapiRequest({
      params: { slug: 'test-grant' },
      auth: { isAuthenticated: true, credentials: { contactId: 'c1' } },
      route: { realm: { plugin: FORMS_ENGINE_PLUGIN_NAME } }
    })

    const result = await handler(request, h)

    expect(multiApplicationRedirect).toHaveBeenCalledWith(request, h)
    expect(result).toBe(h.continue)
  })

  it('returns whatever multiApplicationRedirect returns (redirect/404)', async () => {
    const handler = registerAndGetHandler(server)
    const takenOver = { takenOver: true }
    multiApplicationRedirect.mockResolvedValue(takenOver)

    const request = mockHapiRequest({
      params: { slug: 'test-grant' },
      auth: { isAuthenticated: true, credentials: { contactId: 'c1' } },
      route: { realm: { plugin: FORMS_ENGINE_PLUGIN_NAME } }
    })

    const result = await handler(request, h)

    expect(result).toBe(takenOver)
  })

  it('runs for a custom grant route outside the forms-engine realm too (e.g. application-deleted), so a bad ref 404s there as well', async () => {
    const handler = registerAndGetHandler(server)
    const request = mockHapiRequest({
      params: { slug: 'test-grant' },
      path: '/test-grant/application-deleted',
      auth: { isAuthenticated: true, credentials: { contactId: 'c1' } },
      route: { realm: { plugin: 'router' } }
    })

    await handler(request, h)

    expect(multiApplicationRedirect).toHaveBeenCalledWith(request, h)
  })

  it('runs even when request.route is absent, as long as the request names a grant', async () => {
    const handler = registerAndGetHandler(server)
    const request = mockHapiRequest({ params: { slug: 'test-grant' }, auth: { isAuthenticated: true, credentials: { contactId: 'c1' } } })

    await handler(request, h)

    expect(multiApplicationRedirect).toHaveBeenCalled()
  })
})

describe('multiApplication plugin - reattaching the ref to redirects', () => {
  let server
  let h

  const registerAndGetPreResponse = (srv) => {
    multiApplication.plugin.register(srv)
    const call = srv.ext.mock.calls.find(([event]) => event === 'onPreResponse')
    return call[1]
  }

  const makeRequest = ({
    ref = 'REF-1',
    slug = 'test-grant',
    method = 'post',
    statusCode = 303,
    location = '/test-grant/next'
  } = {}) => ({
    params: { slug },
    query: ref ? { ref } : {},
    method,
    response: { statusCode, headers: location === null ? {} : { location } }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    server = mockHapiServer()
    h = mockHapiResponseToolkit()
  })

  it('registers an onPreResponse extension', () => {
    multiApplication.plugin.register(server)
    expect(server.ext).toHaveBeenCalledWith('onPreResponse', expect.any(Function))
  })

  it('puts the ref back on a POST redirect, which the forms engine strips', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ statusCode: 303, location: '/test-grant/next' })

    const result = handler(request, h)

    expect(request.response.headers.location).toBe('/test-grant/next?ref=REF-1')
    expect(result).toBe(h.continue)
  })

  it('preserves query parameters the redirect already carries', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ location: '/test-grant/next?returnUrl=%2Ftasks' })

    handler(request, h)

    const params = new URLSearchParams(request.response.headers.location.split('?')[1])
    expect(params.get('returnUrl')).toBe('/tasks')
    expect(params.get('ref')).toBe('REF-1')
  })

  it('leaves a redirect that already names an application alone', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ location: '/test-grant/next?ref=REF-OTHER' })

    handler(request, h)

    expect(request.response.headers.location).toBe('/test-grant/next?ref=REF-OTHER')
  })

  it('does nothing when the request has no ref', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ ref: null })

    handler(request, h)

    expect(request.response.headers.location).toBe('/test-grant/next')
  })

  it('does not touch a non-redirect response', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ statusCode: 200 })

    handler(request, h)

    expect(request.response.headers.location).toBe('/test-grant/next')
  })

  it('puts the ref back on a GET redirect too, as long as it moves to a different page', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ method: 'get', statusCode: 302, location: '/test-grant/next' })
    request.path = '/test-grant/tasks'

    handler(request, h)

    expect(request.response.headers.location).toBe('/test-grant/next?ref=REF-1')
  })

  it('puts the ref back on a same-path redirect too (the hidden-field prefill clearing the query it copied) - the onPreHandler hides the ref from that check, so this cannot loop', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ method: 'get', statusCode: 302, location: '/test-grant/tasks' })
    request.path = '/test-grant/tasks'

    handler(request, h)

    expect(request.response.headers.location).toBe('/test-grant/tasks?ref=REF-1')
  })

  it('reads the ref from request.app once the onPreHandler has moved it off the query', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ ref: null })
    request.app = { referenceNumber: 'REF-APP' }

    handler(request, h)

    expect(request.response.headers.location).toBe('/test-grant/next?ref=REF-APP')
  })

  it('does not leak the ref outside the grant journey', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ location: '/auth/sign-out' })

    handler(request, h)

    expect(request.response.headers.location).toBe('/auth/sign-out')
  })

  it('does not leak the ref to another grant', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ location: '/other-grant/tasks' })

    handler(request, h)

    expect(request.response.headers.location).toBe('/other-grant/tasks')
  })

  it('does not leak the ref to an absolute url', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ location: 'https://agreements.test/offer' })

    handler(request, h)

    expect(request.response.headers.location).toBe('https://agreements.test/offer')
  })

  it('does not leak the ref to a protocol-relative url that starts with the slug', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ location: '//test-grant.evil.test/steal' })

    handler(request, h)

    expect(request.response.headers.location).toBe('//test-grant.evil.test/steal')
  })

  it('does nothing when the response carries no location header', () => {
    const handler = registerAndGetPreResponse(server)
    const request = makeRequest({ location: null })

    const result = handler(request, h)

    expect(request.response.headers.location).toBeUndefined()
    expect(result).toBe(h.continue)
  })
})

describe('multiApplication plugin - hiding the ref from the forms engine', () => {
  let server
  let h

  const registerAndGetPreHandler = (srv) => {
    multiApplication.plugin.register(srv)
    const call = srv.ext.mock.calls.find(([event]) => event === 'onPreHandler')
    return call[1]
  }

  const makeRequest = ({ query = { ref: 'REF-1' }, realmPlugin = FORMS_ENGINE_PLUGIN_NAME } = {}) => ({
    query,
    app: {},
    route: { realm: { plugin: realmPlugin } }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    server = mockHapiServer()
    h = mockHapiResponseToolkit()
  })

  it('registers an onPreHandler extension', () => {
    multiApplication.plugin.register(server)
    expect(server.ext).toHaveBeenCalledWith('onPreHandler', expect.any(Function))
  })

  it('moves the ref off the query and onto request.app for a forms-engine route, so the plugin never sees a query to strip', () => {
    const handler = registerAndGetPreHandler(server)
    const request = makeRequest()

    const result = handler(request, h)

    expect(request.query).toEqual({})
    expect(request.app.referenceNumber).toBe('REF-1')
    expect(result).toBe(h.continue)
  })

  it('keeps every other query parameter in place', () => {
    const handler = registerAndGetPreHandler(server)
    const request = makeRequest({ query: { ref: 'REF-1', returnUrl: '/test-grant/summary' } })

    handler(request, h)

    expect(request.query).toEqual({ returnUrl: '/test-grant/summary' })
    expect(request.app.referenceNumber).toBe('REF-1')
  })

  it('leaves a route outside the forms engine (e.g. the applications selector) untouched', () => {
    const handler = registerAndGetPreHandler(server)
    const request = makeRequest({ realmPlugin: 'router' })

    handler(request, h)

    expect(request.query).toEqual({ ref: 'REF-1' })
    expect(request.app.referenceNumber).toBeUndefined()
  })

  it('does nothing when the request has no ref', () => {
    const handler = registerAndGetPreHandler(server)
    const request = makeRequest({ query: { returnUrl: '/x' } })

    handler(request, h)

    expect(request.query).toEqual({ returnUrl: '/x' })
    expect(request.app.referenceNumber).toBeUndefined()
  })

  it('ignores a ref that is not a single string (e.g. repeated ?ref=)', () => {
    const handler = registerAndGetPreHandler(server)
    const request = makeRequest({ query: { ref: ['A', 'B'] } })

    handler(request, h)

    expect(request.query).toEqual({ ref: ['A', 'B'] })
    expect(request.app.referenceNumber).toBeUndefined()
  })

  it('does not throw when request.app is absent', () => {
    const handler = registerAndGetPreHandler(server)
    const request = makeRequest()
    delete request.app

    expect(() => handler(request, h)).not.toThrow()
    expect(request.app.referenceNumber).toBe('REF-1')
  })
})

describe('multiApplication plugin - reattaching the ref to rendered links', () => {
  let server
  let h

  const registerAndGetRenderedLinksHandler = (srv) => {
    multiApplication.plugin.register(srv)
    const calls = srv.ext.mock.calls.filter(([event]) => event === 'onPreResponse')
    return calls[1][1]
  }

  const makeViewRequest = ({
    html,
    ref = 'REF-1',
    slug = 'test-grant',
    variety = 'view',
    statusCode = 200,
    headers = {},
    path = `/${slug}/page`
  }) => ({
    params: { slug },
    path,
    url: new URL(path, 'http://localhost:3000'),
    query: {},
    app: ref ? { referenceNumber: ref } : {},
    response: {
      variety,
      statusCode,
      headers,
      source: {
        manager: { render: vi.fn().mockResolvedValue(html) },
        template: 'page.html',
        context: { title: 'x' },
        options: { layout: 'l' }
      }
    }
  })

  /** Runs the hook and returns the HTML handed to `h.response`. */
  const render = async (request) => {
    const replacement = {
      code: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis()
    }
    const toolkit = mockHapiResponseToolkit({ response: vi.fn(() => replacement) })
    const result = await registerAndGetRenderedLinksHandler(server)(request, toolkit)
    return { result, replacement, toolkit, html: toolkit.response.mock.calls[0]?.[0] }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    server = mockHapiServer()
    h = mockHapiResponseToolkit()
  })

  it('registers a second onPreResponse extension that runs after the dev journey runner, which adds view context', () => {
    multiApplication.plugin.register(server)
    const calls = server.ext.mock.calls.filter(([event]) => event === 'onPreResponse')
    expect(calls).toHaveLength(2)
    expect(calls[1][2]).toEqual({ after: ['journey-runner'] })
  })

  it('renders through the view manager Vision attached to the response, with the same template, context, options and request', async () => {
    const request = makeViewRequest({ html: '<a href="/test-grant/tasks">Tasks</a>' })

    await render(request)

    expect(request.response.source.manager.render).toHaveBeenCalledWith(
      'page.html',
      { title: 'x' },
      { layout: 'l' },
      request
    )
  })

  it('puts the ref on every same-grant href and form action', async () => {
    const request = makeViewRequest({
      html: '<a href="/test-grant/tasks">Tasks</a><form action="/test-grant/page"></form><a href=\'/test-grant\'>Root</a>'
    })

    const { html } = await render(request)

    expect(html).toBe(
      '<a href="/test-grant/tasks?ref=REF-1">Tasks</a><form action="/test-grant/page?ref=REF-1"></form><a href=\'/test-grant?ref=REF-1\'>Root</a>'
    )
  })

  it('appends to an existing, HTML-escaped query string without re-encoding it', async () => {
    const request = makeViewRequest({
      html: '<a href="/test-grant/page?returnUrl=%2Ftest-grant%2Fsummary&amp;page=2">x</a>'
    })

    const { html } = await render(request)

    expect(html).toBe('<a href="/test-grant/page?returnUrl=%2Ftest-grant%2Fsummary&amp;page=2&amp;ref=REF-1">x</a>')
  })

  it('keeps a fragment at the end of the link', async () => {
    const { html } = await render(makeViewRequest({ html: '<a href="/test-grant/page#main">x</a>' }))

    expect(html).toBe('<a href="/test-grant/page?ref=REF-1#main">x</a>')
  })

  it('leaves a link that already names an application alone', async () => {
    const { html } = await render(makeViewRequest({ html: '<a href="/test-grant/page?ref=REF-OTHER">x</a>' }))

    expect(html).toBe('<a href="/test-grant/page?ref=REF-OTHER">x</a>')
  })

  it('puts the ref on a document-relative link too, since the browser resolves it inside the grant', async () => {
    const request = makeViewRequest({
      html: '<a href="remove-parcel?parcelId=SD1">a</a><a href="select-actions?parcelId=SD1&amp;origin=confirm">b</a><a href="?page=2">c</a><a href="./tasks">d</a>',
      path: '/test-grant/confirm-land-and-actions'
    })

    const { html } = await render(request)

    expect(html).toBe(
      '<a href="remove-parcel?parcelId=SD1&amp;ref=REF-1">a</a><a href="select-actions?parcelId=SD1&amp;origin=confirm&amp;ref=REF-1">b</a><a href="?page=2&amp;ref=REF-1">c</a><a href="./tasks?ref=REF-1">d</a>'
    )
  })

  it('leaves a relative link alone when it resolves outside the grant, or on the grant root page', async () => {
    const outside = '<a href="../other-grant/page">a</a><a href="../../x">b</a>'
    expect((await render(makeViewRequest({ html: outside, path: '/test-grant/page' }))).html).toBe(outside)

    const root = '<a href="tasks">a</a>'
    expect((await render(makeViewRequest({ html: root, path: '/test-grant' }))).html).toBe(root)
  })

  it('does not leak the ref to links outside the grant journey', async () => {
    const html =
      '<a href="/auth/sign-out">a</a><a href="/other-grant/page">b</a><a href="/test-grants/page">c</a><a href="https://x.test/test-grant/page">d</a><a href="//test-grant.evil.test/x">e</a><a href="#main">f</a><a href="">g</a><a href="mailto:x@y.test">h</a>'

    expect((await render(makeViewRequest({ html }))).html).toBe(html)
  })

  it('carries the status code and every header already set on the view response over to the replacement', async () => {
    const request = makeViewRequest({
      html: '<a href="/test-grant/tasks">x</a>',
      statusCode: 404,
      headers: { 'content-security-policy': "default-src 'self'", 'referrer-policy': 'no-referrer' }
    })

    const { result, replacement } = await render(request)

    expect(result).toBe(replacement)
    expect(replacement.code).toHaveBeenCalledWith(404)
    expect(replacement.type).toHaveBeenCalledWith('text/html')
    expect(replacement.header).toHaveBeenCalledWith('content-security-policy', "default-src 'self'")
    expect(replacement.header).toHaveBeenCalledWith('referrer-policy', 'no-referrer')
  })

  it('does nothing when the request has no ref', async () => {
    const request = makeViewRequest({ html: '<a href="/test-grant/tasks">x</a>', ref: null })

    const result = await registerAndGetRenderedLinksHandler(server)(request, h)

    expect(result).toBe(h.continue)
    expect(request.response.source.manager.render).not.toHaveBeenCalled()
  })

  it('does nothing for a response that is not a view, or a request with no slug', async () => {
    const handler = registerAndGetRenderedLinksHandler(server)

    expect(await handler(makeViewRequest({ html: '', variety: 'plain' }), h)).toBe(h.continue)
    expect(await handler(makeViewRequest({ html: '', slug: '' }), h)).toBe(h.continue)
  })
})
