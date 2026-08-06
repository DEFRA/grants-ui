import { describe, it, expect, vi, beforeEach } from 'vitest'
import entraIdPlugin from './index.js'
import { getEntraIdOidcOptions } from './entra-id-strategy.js'
import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

vi.mock('./entra-id-strategy.js')
vi.mock('~/src/config/config.js')
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: { AUTH: { ENTRA_ID_AUTH_FAILURE: 'ENTRA_ID_AUTH_FAILURE' } }
}))
vi.mock('@defra/hapi-auth-oidc', () => ({
  hapiAuthOidcPlugin: { name: 'hapi-auth-oidc' }
}))

const DEFAULT_CONFIG = {
  'entraId.loginCallbackUri': '/login/callback',
  'entraId.cookie.password': 'super-secure-cookie-password',
  'entraId.cookie.isSecure': true,
  'entraId.cookie.isSameSite': 'Lax',
  'entraId.session.ttl': 14400000,
  'session.cache.name': 'grants-ui-session-cache'
}

describe('entra-id-auth plugin', () => {
  /** @type {{ register: import('vitest').Mock, cache: import('vitest').Mock, auth: { strategy: import('vitest').Mock }, route: import('vitest').Mock }} */
  let server
  /** @type {{ get: import('vitest').Mock, set: import('vitest').Mock, drop: import('vitest').Mock }} */
  let cache

  beforeEach(() => {
    vi.clearAllMocks()
    config.get.mockImplementation((key) => DEFAULT_CONFIG[key])
    getEntraIdOidcOptions.mockReturnValue({ oidc: { clientId: 'mock-client-id' }, cookieOptions: {} })

    cache = { get: vi.fn(), set: vi.fn(), drop: vi.fn() }
    server = {
      register: vi.fn().mockResolvedValue(undefined),
      cache: vi.fn().mockReturnValue(cache),
      auth: { strategy: vi.fn() },
      route: vi.fn()
    }
  })

  it('should have the correct name', () => {
    expect(entraIdPlugin.plugin.name).toBe('entra-id-auth')
  })

  it('registers the hapi-auth-oidc plugin with the built options', async () => {
    await entraIdPlugin.plugin.register(server)

    expect(server.register).toHaveBeenCalledWith({
      plugin: { name: 'hapi-auth-oidc' },
      options: { oidc: { clientId: 'mock-client-id' }, cookieOptions: {} }
    })
  })

  it('registers a cookie-backed entra-id-session strategy scoped to the named Redis cache and a dedicated segment', async () => {
    await entraIdPlugin.plugin.register(server)

    expect(server.cache).toHaveBeenCalledWith({
      cache: 'grants-ui-session-cache',
      segment: 'entra-id-session',
      expiresIn: 14400000
    })
    expect(server.auth.strategy).toHaveBeenCalledWith(
      'entra-id-session',
      'cookie',
      expect.objectContaining({
        cookie: expect.objectContaining({
          name: 'entraIdSessionId',
          password: 'super-secure-cookie-password',
          isSecure: true,
          isSameSite: 'Lax',
          ttl: 14400000
        })
      })
    )
  })

  it('registers /login and only a GET variant of the configured callback path', async () => {
    await entraIdPlugin.plugin.register(server)

    expect(server.route).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/login', options: { auth: false } })
    )
    expect(server.route).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/login/callback', options: { auth: false } })
    )
    // responseMode is hardcoded to 'query' (entra-id-strategy.js), so Azure never POSTs the
    // callback - registering a POST route would just be unauthenticated, crumb-exempt surface
    // with nothing behind it.
    expect(server.route).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }))
  })

  describe('/login handler', () => {
    let loginHandler

    beforeEach(async () => {
      await entraIdPlugin.plugin.register(server)
      loginHandler = server.route.mock.calls.find((call) => call[0].path === '/login')[0].handler
    })

    it('stores the referer as a relative path and delegates to request.login', () => {
      const request = {
        info: { referrer: 'https://grants-ui.example.com/some-page?x=1' },
        yar: { set: vi.fn() },
        login: vi.fn().mockReturnValue('login-response')
      }
      const h = {}

      const result = loginHandler(request, h)

      expect(request.yar.set).toHaveBeenCalledWith('entraIdRedirect', '/some-page?x=1')
      expect(request.login).toHaveBeenCalledWith(h)
      expect(result).toBe('login-response')
    })

    it('falls back to / when there is no referer', () => {
      const request = {
        info: { referrer: undefined },
        yar: { set: vi.fn() },
        login: vi.fn()
      }

      loginHandler(request, {})

      expect(request.yar.set).toHaveBeenCalledWith('entraIdRedirect', '/')
    })

    it('does not redirect back into the callback route itself', () => {
      const request = {
        info: { referrer: 'https://grants-ui.example.com/login/callback?code=abc' },
        yar: { set: vi.fn() },
        login: vi.fn()
      }

      loginHandler(request, {})

      expect(request.yar.set).toHaveBeenCalledWith('entraIdRedirect', '/')
    })

    it('does not redirect back to /login itself', () => {
      const request = {
        info: { referrer: 'https://grants-ui.example.com/login' },
        yar: { set: vi.fn() },
        login: vi.fn()
      }

      loginHandler(request, {})

      expect(request.yar.set).toHaveBeenCalledWith('entraIdRedirect', '/')
    })

    it('rejects a protocol-relative referer path instead of storing an open redirect', () => {
      // new URL('https://evil.test//attacker.test/x').pathname === '//attacker.test/x', which
      // browsers resolve as an absolute external URL - getSafeRedirect must catch this.
      const request = {
        info: { referrer: 'https://evil.test//attacker.test/x' },
        yar: { set: vi.fn() },
        login: vi.fn()
      }

      loginHandler(request, {})

      expect(request.yar.set).toHaveBeenCalledWith('entraIdRedirect', '/home')
      expect(request.yar.set.mock.calls[0][1]).not.toMatch(/^\/\//)
    })
  })

  describe('callback handler', () => {
    let callbackHandler
    const h = {}

    beforeEach(async () => {
      await entraIdPlugin.plugin.register(server)
      callbackHandler = server.route.mock.calls.find((call) => call[0].path === '/login/callback')[0].handler
    })

    it('saves the session, sets the cookie and redirects to the stored referer', async () => {
      const credentials = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        claims: { oid: 'user-123', name: 'Jane Doe', email: 'jane@example.com' }
      }
      const request = {
        callback: vi.fn().mockResolvedValue(credentials),
        entraIdCookieAuth: { set: vi.fn() },
        yar: { get: vi.fn().mockReturnValue('/some-page'), clear: vi.fn() }
      }
      const redirect = vi.fn().mockReturnValue('redirect-response')
      const localH = { redirect }

      const result = await callbackHandler(request, localH)

      expect(cache.set).toHaveBeenCalledWith(expect.any(String), {
        id: 'user-123',
        displayName: 'Jane Doe',
        email: 'jane@example.com',
        isAuthenticated: true,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600
      })
      expect(request.entraIdCookieAuth.set).toHaveBeenCalledWith({ sessionId: expect.any(String) })
      expect(request.yar.clear).toHaveBeenCalledWith('entraIdRedirect')
      expect(redirect).toHaveBeenCalledWith('/some-page')
      expect(result).toBe('redirect-response')
    })

    it('redirects to / when nothing was stored', async () => {
      const request = {
        callback: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 1, claims: {} }),
        entraIdCookieAuth: { set: vi.fn() },
        yar: { get: vi.fn().mockReturnValue(null), clear: vi.fn() }
      }
      const redirect = vi.fn()

      await callbackHandler(request, { redirect })

      expect(redirect).toHaveBeenCalledWith('/')
    })

    it('re-sanitises the stored redirect on read, rejecting a protocol-relative value', async () => {
      const request = {
        callback: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 1, claims: {} }),
        entraIdCookieAuth: { set: vi.fn() },
        yar: { get: vi.fn().mockReturnValue('//attacker.test/x'), clear: vi.fn() }
      }
      const redirect = vi.fn()

      await callbackHandler(request, { redirect })

      expect(redirect).toHaveBeenCalledWith('/home')
    })

    it('throws unauthorized when request.callback resolves without credentials', async () => {
      const request = { callback: vi.fn().mockResolvedValue(null) }

      await expect(callbackHandler(request, h)).rejects.toThrow()
    })
  })

  describe('entra-id-session cookie strategy validate()', () => {
    let validate

    beforeEach(async () => {
      await entraIdPlugin.plugin.register(server)
      validate = server.auth.strategy.mock.calls[0][2].validate
    })

    it('is invalid when the cookie has no sessionId', async () => {
      const result = await validate({}, {})
      expect(result).toEqual({ isValid: false })
    })

    it('is invalid when the cached session is missing or not authenticated', async () => {
      cache.get.mockResolvedValue(null)
      const result = await validate({}, { sessionId: 'abc' })
      expect(result).toEqual({ isValid: false })
    })

    it('returns the cached session unchanged when the token is still valid', async () => {
      const currentSession = { isAuthenticated: true, accessToken: 'a', refreshToken: 'r' }
      cache.get.mockResolvedValue(currentSession)
      const request = { ensureValidToken: vi.fn().mockResolvedValue({ token: currentSession, refreshed: false }) }

      const result = await validate(request, { sessionId: 'abc' })

      expect(result).toEqual({ isValid: true, credentials: currentSession })
      expect(cache.set).not.toHaveBeenCalled()
    })

    it('refreshes and persists the session when the token was near expiry', async () => {
      const currentSession = { isAuthenticated: true, accessToken: 'a', refreshToken: 'r' }
      const refreshedToken = {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
        claims: { oid: 'user-123', name: 'Jane Doe', email: 'jane@example.com' }
      }
      cache.get.mockResolvedValue(currentSession)
      const request = {
        ensureValidToken: vi.fn().mockResolvedValue({ token: refreshedToken, refreshed: true })
      }

      const result = await validate(request, { sessionId: 'abc' })

      expect(cache.set).toHaveBeenCalledWith('abc', {
        id: 'user-123',
        displayName: 'Jane Doe',
        email: 'jane@example.com',
        isAuthenticated: true,
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 3600
      })
      expect(result.isValid).toBe(true)
      expect(result.credentials.accessToken).toBe('new-access')
    })

    it('drops the session and logs when the refresh itself fails', async () => {
      const currentSession = { isAuthenticated: true, accessToken: 'a', refreshToken: 'r' }
      cache.get.mockResolvedValue(currentSession)
      const request = { ensureValidToken: vi.fn().mockRejectedValue(new Error('refresh_token expired')) }

      const result = await validate(request, { sessionId: 'abc' })

      expect(cache.drop).toHaveBeenCalledWith('abc')
      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.ENTRA_ID_AUTH_FAILURE,
        expect.objectContaining({ errorMessage: expect.stringContaining('refresh_token expired') })
      )
      expect(result).toEqual({ isValid: false })
    })
  })
})
