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

  it('does not run for a route registered in a different plugin realm (e.g. /applications) - would otherwise redirect to itself', async () => {
    const handler = registerAndGetHandler(server)
    const request = mockHapiRequest({
      params: { slug: 'test-grant' },
      auth: { isAuthenticated: true, credentials: { contactId: 'c1' } },
      route: { realm: { plugin: 'applications' } }
    })

    const result = await handler(request, h)

    expect(result).toBe(h.continue)
    expect(multiApplicationRedirect).not.toHaveBeenCalled()
  })

  it('does not run when request.route is absent', async () => {
    const handler = registerAndGetHandler(server)
    const request = mockHapiRequest({
      params: { slug: 'test-grant' },
      auth: { isAuthenticated: true, credentials: { contactId: 'c1' } }
    })
    delete request.route

    const result = await handler(request, h)

    expect(result).toBe(h.continue)
    expect(multiApplicationRedirect).not.toHaveBeenCalled()
  })
})
