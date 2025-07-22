import Hapi from '@hapi/hapi'
import SsoPlugin from '~/src/plugins/sso.js'

describe('SSO Plugin', () => {
  let server
  let h

  beforeEach(() => {
    server = Hapi.server()

    h = {
      continue: Symbol('continue'),
      redirect: jest.fn().mockReturnThis(),
      takeover: jest.fn().mockReturnValue(Symbol('takeover'))
    }

    server.ext = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('registers the plugin correctly', () => {
    SsoPlugin.plugin.register(server)

    expect(server.ext).toHaveBeenCalledTimes(1)
    expect(server.ext).toHaveBeenCalledWith('onRequest', expect.any(Function))
  })

  test('handles requests with ssoOrgId query parameter', () => {
    SsoPlugin.plugin.register(server)

    const onRequestHandler = server.ext.mock.calls[0][1]

    const request = {
      query: {
        ssoOrgId: 'org-123',
        someOtherParam: 'value'
      },
      url: {
        pathname: '/home',
        search: '?ssoOrgId=org-123&someOtherParam=value'
      }
    }

    const result = onRequestHandler(request, h)

    expect(h.redirect).toHaveBeenCalledWith(
      '/auth/organisation?organisationId=org-123&redirect=/home?someOtherParam=value'
    )
    expect(h.takeover).toHaveBeenCalled()
    expect(result).toBeDefined()
  })

  test('handles requests with ssoOrgId as the only query parameter', () => {
    SsoPlugin.plugin.register(server)

    const onRequestHandler = server.ext.mock.calls[0][1]

    const request = {
      query: {
        ssoOrgId: 'org-123'
      },
      url: {
        pathname: '/home',
        search: '?ssoOrgId=org-123'
      }
    }

    const result = onRequestHandler(request, h)

    expect(h.redirect).toHaveBeenCalledWith('/auth/organisation?organisationId=org-123&redirect=/home')
    expect(h.takeover).toHaveBeenCalled()
    expect(result).toBeDefined()
  })

  test('continues request processing when no ssoOrgId present', () => {
    SsoPlugin.plugin.register(server)

    const onRequestHandler = server.ext.mock.calls[0][1]

    const request = {
      query: {
        someOtherParam: 'value'
      },
      url: {
        pathname: '/home',
        search: '?someOtherParam=value'
      }
    }

    const result = onRequestHandler(request, h)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
    expect(h.takeover).not.toHaveBeenCalled()
  })

  test('handles URL encoding in query parameters', () => {
    SsoPlugin.plugin.register(server)

    const onRequestHandler = server.ext.mock.calls[0][1]

    const request = {
      query: {
        ssoOrgId: 'org-123',
        redirectUrl: '/some/path?param=value'
      },
      url: {
        pathname: '/home',
        search: '?ssoOrgId=org-123&redirectUrl=%2Fsome%2Fpath%3Fparam%3Dvalue'
      }
    }

    const result = onRequestHandler(request, h)

    expect(h.redirect).toHaveBeenCalledWith(
      '/auth/organisation?organisationId=org-123&redirect=/home?redirectUrl=%2Fsome%2Fpath%3Fparam%3Dvalue'
    )
    expect(h.takeover).toHaveBeenCalled()
    expect(result).toBeDefined()
  })

  test('preserves complex query parameters', () => {
    SsoPlugin.plugin.register(server)

    const onRequestHandler = server.ext.mock.calls[0][1]

    const request = {
      query: {
        ssoOrgId: 'org-123',
        filters: ['active', 'pending'],
        search: 'test&special'
      },
      url: {
        pathname: '/home',
        search: '?ssoOrgId=org-123&filters=active&filters=pending&search=test%26special'
      }
    }

    onRequestHandler(request, h)

    // Verify redirect preserves other parameters
    // The exact string depends on URLSearchParams encoding, but should contain the parameters
    expect(h.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/auth/organisation?organisationId=org-123&redirect=/home?')
    )
    expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('filters=active'))
    expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('filters=pending'))
    expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('search='))
  })
})
