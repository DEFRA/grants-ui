import Bell from '@hapi/bell'
import Cookie from '@hapi/cookie'
import Hapi from '@hapi/hapi'
import Jwt from '@hapi/jwt'
import Yar from '@hapi/yar'
import { config } from '~/src/config/config.js'
import AuthPlugin, {
  getBellOptions,
  getCookieOptions
} from '~/src/plugins/auth.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { getSafeRedirect } from '~/src/server/auth/get-safe-redirect.js'
import { refreshTokens } from '~/src/server/auth/refresh-tokens.js'

jest.mock('@hapi/jwt')
jest.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    AUTH: {
      SESSION_EXPIRED: { level: 'info', messageFunc: jest.fn() },
      TOKEN_VERIFICATION_SUCCESS: { level: 'info', messageFunc: jest.fn() },
      TOKEN_VERIFICATION_FAILURE: { level: 'error', messageFunc: jest.fn() },
      AUTH_DEBUG: { level: 'debug', messageFunc: jest.fn() },
      SIGN_IN_FAILURE: { level: 'error', messageFunc: jest.fn() },
      UNAUTHORIZED_ACCESS: { level: 'error', messageFunc: jest.fn() }
    },
    SYSTEM: {
      ENV_CONFIG_DEBUG: { level: 'debug', messageFunc: jest.fn() },
      SERVER_ERROR: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))
jest.mock('~/src/server/auth/get-oidc-config')
jest.mock('~/src/server/auth/refresh-tokens')
jest.mock('~/src/server/auth/get-safe-redirect')
jest.mock('~/src/config/config', () => ({
  config: {
    get: jest.fn((key) => {
      const mockConfig = {
        'defraId.clientId': 'test-client-id',
        'defraId.clientSecret': 'test-client-secret',
        'defraId.serviceId': 'test-service-id',
        'defraId.redirectUrl': 'https://example.com/auth/callback',
        'defraId.refreshTokens': true,
        'session.cookie.password': 'at-least-32-characters-long-for-security',
        'session.cookie.secure': false,
        isProduction: false
      }
      return mockConfig[key]
    })
  }
}))

describe('Auth Plugin', () => {
  let server
  const mockOidcConfig = {
    authorization_endpoint: 'https://auth.example.com/authorize',
    token_endpoint: 'https://auth.example.com/token'
  }

  const mockDecodedToken = {
    decoded: {
      payload: {
        firstName: 'John',
        lastName: 'Doe',
        contactId: '12345',
        currentRelationshipId: 'org-123'
      }
    }
  }

  beforeEach(async () => {
    server = Hapi.server()

    server.app.cache = {
      get: jest.fn(),
      set: jest.fn()
    }

    await server.register([Bell, Cookie, Yar])

    server.auth.strategy = jest.fn()
    server.auth.default = jest.fn()

    getOidcConfig.mockResolvedValue(mockOidcConfig)

    Jwt.token.decode.mockReturnValue(mockDecodedToken)
    Jwt.token.verifyTime = jest.fn()

    getSafeRedirect.mockImplementation((path) => path)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('registers the plugin correctly', async () => {
    // Instead of registering the plugin directly, call the register function manually
    // since we've mocked out server.auth.strategy and server.auth.default
    await AuthPlugin.plugin.register(server)

    expect(server.auth.strategy).toHaveBeenCalledTimes(2)
    expect(server.auth.strategy).toHaveBeenCalledWith(
      'defra-id',
      'bell',
      expect.any(Object)
    )
    expect(server.auth.strategy).toHaveBeenCalledWith(
      'session',
      'cookie',
      expect.any(Object)
    )

    expect(server.auth.default).toHaveBeenCalledWith('session')
  })

  describe('getBellOptions', () => {
    test('returns the correct bell options', () => {
      const options = getBellOptions(mockOidcConfig)

      expect(options.provider.auth).toBe(mockOidcConfig.authorization_endpoint)
      expect(options.provider.token).toBe(mockOidcConfig.token_endpoint)
      expect(options.clientId).toBe('test-client-id')
      expect(options.clientSecret).toBe('test-client-secret')
      expect(options.isSecure).toBe(false)
    })

    test('profile function maps JWT payload to credentials', () => {
      const options = getBellOptions(mockOidcConfig)
      const credentials = { token: 'test-token' }

      options.provider.profile(credentials)

      expect(Jwt.token.decode).toHaveBeenCalledWith('test-token')
      expect(credentials.profile).toMatchObject({
        firstName: 'John',
        lastName: 'Doe',
        contactId: '12345',
        currentRelationshipId: 'org-123',
        crn: '12345',
        name: 'John Doe',
        organisationId: 'org-123'
      })
      // Check that sessionId is a valid UUID
      expect(credentials.profile.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })

    test('location function handles redirect parameter', () => {
      const options = getBellOptions(mockOidcConfig)
      const mockRequest = {
        query: { redirect: '/home' },
        yar: { set: jest.fn() },
        url: { href: 'http://localhost:3000/auth?redirect=%2Fhome' }, // Added url.href
        method: 'GET', // Optionally add method if used in logging
        headers: { host: 'localhost:3000', origin: 'http://localhost:3000' }
      }

      const result = options.location(mockRequest)

      expect(getSafeRedirect).toHaveBeenCalledWith('/home')
      expect(mockRequest.yar.set).toHaveBeenCalled()
      expect(result).toBe('https://example.com/auth/callback')
    })

    test('providerParams function includes required parameters', () => {
      const options = getBellOptions(mockOidcConfig)
      const mockRequestDefault = {
        path: '/something-else',
        query: {}
      }

      const params = options.providerParams(mockRequestDefault)
      expect(params).toEqual({
        serviceId: 'test-service-id'
      })

      const mockRequestOrg = {
        path: '/auth/organisation',
        query: { organisationId: 'org-456' }
      }

      const orgParams = options.providerParams(mockRequestOrg)
      expect(orgParams).toEqual({
        serviceId: 'test-service-id',
        forceReselection: true,
        relationshipId: 'org-456'
      })
    })
  })

  describe('getCookieOptions', () => {
    test('returns the correct cookie options', () => {
      const options = getCookieOptions()

      expect(options.cookie.password).toBe(
        'at-least-32-characters-long-for-security'
      )
      expect(options.cookie.isSecure).toBe(false)
      expect(options.cookie.isSameSite).toBe('Lax')
    })

    test('redirectTo function returns correct URL', () => {
      const options = getCookieOptions()
      const mockRequest = {
        url: {
          pathname: '/home',
          search: '?filter=active'
        }
      }

      const redirectUrl = options.redirectTo(mockRequest)
      expect(redirectUrl).toBe('/auth/sign-in?redirect=/home?filter=active')
    })

    test('validate function returns invalid when session not found', async () => {
      const options = getCookieOptions()
      server.app.cache.get.mockResolvedValue(null)

      const mockRequest = { server }
      const result = await options.validate(mockRequest, {
        sessionId: 'test-session'
      })

      expect(server.app.cache.get).toHaveBeenCalledWith('test-session')
      expect(result).toEqual({ isValid: false })
    })

    test('validate function refreshes token when expired', async () => {
      const options = getCookieOptions()

      const userSession = {
        token: 'expired-token',
        refreshToken: 'refresh-token'
      }

      server.app.cache.get.mockResolvedValue(userSession)
      Jwt.token.verifyTime.mockImplementation(() => {
        throw new Error('Token expired')
      })

      refreshTokens.mockResolvedValue({
        access_token: 'new-token',
        refresh_token: 'new-refresh-token'
      })

      const mockRequest = { server }
      const result = await options.validate(mockRequest, {
        sessionId: 'test-session'
      })

      expect(refreshTokens).toHaveBeenCalledWith('refresh-token')
      expect(server.app.cache.set).toHaveBeenCalledWith('test-session', {
        token: 'new-token',
        refreshToken: 'new-refresh-token'
      })
      expect(result).toEqual({ isValid: true, credentials: userSession })
      expect(userSession.token).toBe('new-token')
      expect(userSession.refreshToken).toBe('new-refresh-token')
    })

    test('validate function returns valid session when token is valid', async () => {
      const options = getCookieOptions()

      const userSession = {
        token: 'valid-token',
        refreshToken: 'refresh-token'
      }

      server.app.cache.get.mockResolvedValue(userSession)

      const mockRequest = { server }
      const result = await options.validate(mockRequest, {
        sessionId: 'test-session'
      })

      expect(Jwt.token.verifyTime).toHaveBeenCalled()
      expect(result).toEqual({ isValid: true, credentials: userSession })
    })

    test('validate function returns invalid when token expired and refresh is disabled', async () => {
      const options = getCookieOptions()

      config.get.mockImplementation((key) => {
        if (key === 'defraId.refreshTokens') return false

        const mockConfig = {
          'session.cookie.password': 'at-least-32-characters-long-for-security',
          isProduction: false
        }
        return mockConfig[key]
      })

      const userSession = {
        token: 'expired-token',
        refreshToken: 'refresh-token'
      }

      server.app.cache.get.mockResolvedValue(userSession)
      Jwt.token.verifyTime.mockImplementation(() => {
        throw new Error('Token expired')
      })

      const mockRequest = { server }
      const result = await options.validate(mockRequest, {
        sessionId: 'test-session'
      })

      expect(refreshTokens).not.toHaveBeenCalled()
      expect(result).toEqual({ isValid: false })
    })
  })
})
