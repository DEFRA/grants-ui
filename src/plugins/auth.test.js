import { vi } from 'vitest'
import Bell from '@hapi/bell'
import Cookie from '@hapi/cookie'
import Hapi from '@hapi/hapi'
import Jwt from '@hapi/jwt'
import Yar from '@hapi/yar'
import { config } from '~/src/config/config.js'
import AuthPlugin, { getBellOptions, getCookieOptions, mapPayloadToProfile } from '~/src/plugins/auth.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { getSafeRedirect } from '~/src/server/auth/get-safe-redirect.js'
import { refreshTokens } from '~/src/server/auth/refresh-tokens.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

vi.mock('@hapi/jwt')
vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelperWithCustomCodes } = await import('~/src/__mocks__')
  return mockLogHelperWithCustomCodes({
    SYSTEM: {
      ENV_CONFIG_DEBUG: { level: 'debug', messageFunc: vi.fn() },
      PLUGIN_REGISTRATION: { level: 'info', messageFunc: vi.fn() }
    }
  })
})
vi.mock('~/src/server/auth/get-oidc-config')
vi.mock('~/src/server/auth/refresh-tokens')
vi.mock('~/src/server/auth/get-safe-redirect')

const DEFAULT_CONFIG = {
  'defraId.enabled': true,
  'defraId.clientId': 'test-client-id',
  'defraId.clientSecret': 'test-client-secret',
  'defraId.serviceId': 'test-service-id',
  'defraId.redirectUrl': 'https://example.com/auth/callback',
  'defraId.refreshTokens': true,
  'defraId.wellKnownUrl': 'https://auth.example.com/.well-known/openid_configuration',
  'session.cookie.password': 'at-least-32-characters-long-for-security',
  'session.cookie.secure': false,
  isProduction: false
}

const MOCK_USERS = {
  valid: {
    firstName: 'John',
    lastName: 'Doe',
    contactId: '12345',
    currentRelationshipId: '123456',
    relationships: ['org-456:sbi-5678:Farm 2:1234567890', '123456:987654:Farm 1:1234567890']
  },
  incomplete: {
    firstName: 'John'
  },
  user123: {
    contactId: 'user123',
    token: 'expired-token',
    refreshToken: 'refresh-token'
  },
  user456: {
    contactId: 'user456',
    token: 'expired-token',
    refreshToken: 'refresh-token'
  },
  user789: {
    contactId: 'user789',
    organisationId: 'org456',
    token: 'expired-token',
    refreshToken: 'refresh-token'
  }
}

const MOCK_REQUESTS = {
  withRedirect: {
    query: { redirect: '/home' },
    yar: { set: vi.fn() },
    url: { href: 'http://localhost:3000/auth?redirect=%2Fhome', pathname: '/home', search: '?filter=active' },
    method: 'GET',
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000' }
  },
  authPage: {
    query: {},
    path: '/auth/sign-in',
    method: 'POST'
  }
}

const OIDC_CONFIG_BASE = {
  issuer: 'NOT_SET',
  authorization_endpoint: 'NOT_SET',
  token_endpoint: 'NOT_SET',
  userinfo_endpoint: 'NOT_SET',
  jwks_uri: 'NOT_SET',
  end_session_endpoint: 'NOT_SET',
  scopes_supported: 'NOT_SET',
  response_types_supported: 'NOT_SET',
  grant_types_supported: 'NOT_SET',
  token_endpoint_auth_methods_supported: 'NOT_SET'
}

const OIDC_CONFIG_VALUES = {
  full: {
    ...OIDC_CONFIG_BASE,
    issuer: 'https://auth.example.com',
    authorization_endpoint: 'https://auth.example.com/authorize',
    token_endpoint: 'https://auth.example.com/token',
    userinfo_endpoint: 'https://auth.example.com/userinfo',
    jwks_uri: 'https://auth.example.com/jwks',
    end_session_endpoint: 'https://auth.example.com/logout',
    scopes_supported: ['openid', 'profile'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['client_secret_post']
  },
  partial: {
    ...OIDC_CONFIG_BASE,
    issuer: 'https://auth.example.com',
    authorization_endpoint: 'https://auth.example.com/authorize'
  },
  missingAuthEndpoint: {
    ...OIDC_CONFIG_BASE,
    issuer: 'https://auth.example.com'
  },
  missingIssuer: {
    ...OIDC_CONFIG_BASE,
    authorization_endpoint: 'https://auth.example.com/authorize'
  }
}

const LOG_MESSAGES = {
  pluginRegistration: {
    starting: { pluginName: 'auth', status: 'starting' },
    completed: { pluginName: 'auth', status: 'completed' }
  },
  oidcDebug: {
    configType: 'OIDC_WellKnown_Response'
  },
  authDebug: {
    base: {
      path: 'auth_plugin_registration',
      isAuthenticated: 'system',
      strategy: 'system',
      mode: 'oidc_config_failure',
      hasCredentials: false,
      hasToken: false,
      hasProfile: false,
      userAgent: 'server',
      referer: 'none',
      queryParams: {}
    }
  },
  signInFailure: {
    baseFields: {
      userId: 'unknown'
    },
    steps: {
      JWT_DECODE_ERROR: 'bell_profile_jwt_decode_error',
      EMPTY_PAYLOAD: 'bell_profile_empty_payload',
      MISSING_FIELDS: 'bell_profile_missing_fields',
      PROCESSING_ERROR: 'bell_profile_processing_error',
      REDIRECT_STORE_ERROR: 'bell_location_redirect_store_error',
      LOCATION_FUNCTION_ERROR: 'bell_location_function_error'
    }
  },
  sessionExpired: {
    reasons: {
      NOT_FOUND: 'Session not found in cache',
      TOKEN_EXPIRED_REFRESH_DISABLED: 'Token expired, refresh disabled'
    }
  },
  tokenVerification: {
    steps: {
      REFRESH_SUCCESS: 'token_refresh_success',
      REFRESH_FAILED: 'token_refresh_failed'
    }
  }
}

const createMockConfigWithOverrides = (overrides = {}) => {
  return (key) => ({ ...DEFAULT_CONFIG, ...overrides })[key]
}

const createMockError = (message, name = 'Error', stack = null) => {
  const error = new Error(message)
  if (name) {
    error.name = name
  }
  if (stack) {
    error.stack = stack
  }
  return error
}

vi.mock('~/src/config/config', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'defraId.enabled') {
        return true
      }
      return undefined
    })
  }
}))

describe('Auth Plugin', () => {
  let server
  const mockOidcConfig = OIDC_CONFIG_VALUES.full

  const mockDecodedToken = {
    decoded: {
      payload: MOCK_USERS.valid
    }
  }

  beforeEach(async () => {
    server = Hapi.server()

    server.app.cache = {
      get: vi.fn(),
      set: vi.fn()
    }

    await server.register([Bell, Cookie, Yar])

    server.auth.strategy = vi.fn()
    server.auth.default = vi.fn()

    getOidcConfig.mockResolvedValue(mockOidcConfig)

    Jwt.token.decode.mockReturnValue(mockDecodedToken)
    Jwt.token.verifyTime = vi.fn()

    getSafeRedirect.mockImplementation((path) => path)

    // Set up config mock with DEFAULT_CONFIG
    config.get.mockImplementation((key) => DEFAULT_CONFIG[key])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('registers the plugin correctly', async () => {
    // Instead of registering the plugin directly, call the register function manually
    // since we've mocked out server.auth.strategy and server.auth.default
    await AuthPlugin.plugin.register(server)

    expect(server.auth.strategy).toHaveBeenCalledTimes(2)
    expect(server.auth.strategy).toHaveBeenCalledWith('defra-id', 'bell', expect.any(Object))
    expect(server.auth.strategy).toHaveBeenCalledWith('session', 'cookie', expect.any(Object))
  })

  test('logs plugin registration start and completion', async () => {
    await AuthPlugin.plugin.register(server)

    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.PLUGIN_REGISTRATION, LOG_MESSAGES.pluginRegistration.starting)

    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.PLUGIN_REGISTRATION, LOG_MESSAGES.pluginRegistration.completed)
  })

  test('logs detailed OIDC configuration in debug mode', async () => {
    await AuthPlugin.plugin.register(server)

    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
      ...LOG_MESSAGES.oidcDebug,
      configValues: OIDC_CONFIG_VALUES.full
    })
  })

  test('logs OIDC configuration with NOT_SET for missing values', async () => {
    const partialOidcConfig = {
      issuer: OIDC_CONFIG_VALUES.full.issuer,
      authorization_endpoint: OIDC_CONFIG_VALUES.full.authorization_endpoint
    }
    getOidcConfig.mockResolvedValue(partialOidcConfig)

    await AuthPlugin.plugin.register(server)

    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
      ...LOG_MESSAGES.oidcDebug,
      configValues: OIDC_CONFIG_VALUES.partial
    })
  })

  test('logs OIDC configuration with NOT_SET when authorization_endpoint is missing', async () => {
    const configWithoutAuthEndpoint = {
      issuer: OIDC_CONFIG_VALUES.full.issuer
    }
    getOidcConfig.mockResolvedValue(configWithoutAuthEndpoint)

    await AuthPlugin.plugin.register(server)

    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
      ...LOG_MESSAGES.oidcDebug,
      configValues: OIDC_CONFIG_VALUES.missingAuthEndpoint
    })
  })

  test('logs OIDC configuration with NOT_SET when issuer is missing', async () => {
    const configWithoutIssuer = {
      authorization_endpoint: OIDC_CONFIG_VALUES.full.authorization_endpoint
    }
    getOidcConfig.mockResolvedValue(configWithoutIssuer)

    await AuthPlugin.plugin.register(server)

    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
      ...LOG_MESSAGES.oidcDebug,
      configValues: OIDC_CONFIG_VALUES.missingIssuer
    })
  })

  test('throws an error if OIDC config cannot be fetched', async () => {
    getOidcConfig.mockRejectedValue(new Error('Failed to fetch OIDC config'))
    await expect(AuthPlugin.plugin.register(server)).rejects.toThrow('Failed to fetch OIDC config')
    await expect(AuthPlugin.plugin.register(server)).rejects.toMatchObject({ alreadyLogged: true })
  })

  test('logs detailed error information when OIDC config fetch fails', async () => {
    const error = createMockError('Network timeout', 'Error', 'Error: Network timeout\n    at test')
    getOidcConfig.mockRejectedValue(error)

    config.get.mockImplementation(createMockConfigWithOverrides())

    await expect(AuthPlugin.plugin.register(server)).rejects.toThrow()

    expect(log).toHaveBeenCalledWith(LogCodes.AUTH.AUTH_DEBUG, {
      ...LOG_MESSAGES.authDebug.base,
      authError: 'OIDC config fetch failed: Network timeout',
      errorDetails: {
        message: 'Network timeout',
        stack: 'Error: Network timeout\n    at test',
        wellKnownUrl: DEFAULT_CONFIG['defraId.wellKnownUrl']
      }
    })
  })

  describe('getBellOptions', () => {
    test('returns the correct bell options', () => {
      const options = getBellOptions(mockOidcConfig)

      expect(options.provider.auth).toBe(mockOidcConfig.authorization_endpoint)
      expect(options.provider.token).toBe(mockOidcConfig.token_endpoint)
      expect(options.clientId).toBe(DEFAULT_CONFIG['defraId.clientId'])
      expect(options.clientSecret).toBe(DEFAULT_CONFIG['defraId.clientSecret'])
      expect(options.isSecure).toBe(false)
    })

    test('profile function maps JWT payload to credentials', () => {
      const options = getBellOptions(mockOidcConfig)
      const credentials = { token: 'test-token' }

      options.provider.profile(credentials)

      expect(Jwt.token.decode).toHaveBeenCalledWith('test-token')
      expect(credentials.profile).toMatchObject({
        ...MOCK_USERS.valid
      })
      // Check that sessionId is a valid UUID
      expect(credentials.profile.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    test('location function handles redirect parameter', () => {
      const options = getBellOptions(mockOidcConfig)
      const mockRequest = { ...MOCK_REQUESTS.withRedirect }

      const result = options.location(mockRequest)

      expect(getSafeRedirect).toHaveBeenCalledWith('/home')
      expect(mockRequest.yar.set).toHaveBeenCalled()
      expect(result).toBe(DEFAULT_CONFIG['defraId.redirectUrl'])
    })

    test('location function throws error if setting redirect yar key fails and logs it', () => {
      const options = getBellOptions(mockOidcConfig)
      const mockRequest = {
        query: { redirect: '/home' },
        yar: {
          set: vi.fn(() => {
            throw new Error('Yar set error')
          })
        },
        url: { href: 'http://localhost:3000/auth?redirect=%2Fhome' }, // Added url.href
        method: 'GET',
        headers: { host: 'localhost:3000', origin: 'http://localhost:3000' }
      }

      options.location(mockRequest)

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.SIGN_IN_FAILURE, {
        ...LOG_MESSAGES.signInFailure.baseFields,
        error: 'Failed to store redirect parameter: Yar set error',
        step: LOG_MESSAGES.signInFailure.steps.REDIRECT_STORE_ERROR,
        redirectError: {
          message: 'Yar set error',
          stack: expect.any(String),
          originalRedirect: expect.any(String)
        }
      })
    })

    test('location function throws error if config keys are not set', () => {
      config.get.mockImplementation((key) => {
        if (key === 'defraId.redirectUrl') {
          throw createMockError('Config read error')
        }
        return DEFAULT_CONFIG[key]
      })

      const options = getBellOptions(mockOidcConfig)
      const mockRequest = {
        query: { redirect: '/home' },
        yar: {
          set: vi.fn()
        },
        url: { href: 'http://localhost:3000/auth?redirect=%2Fhome' },
        method: 'GET',
        headers: { host: 'localhost:3000', origin: 'http://localhost:3000' }
      }

      expect(() => options.location(mockRequest)).toThrow('Config read error')

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.SIGN_IN_FAILURE, {
        ...LOG_MESSAGES.signInFailure.baseFields,
        error: 'Bell location function failed: Config read error',
        step: LOG_MESSAGES.signInFailure.steps.LOCATION_FUNCTION_ERROR,
        locationError: expect.objectContaining({
          message: 'Config read error',
          stack: expect.anything()
        })
      })
    })

    test('providerParams function includes required parameters', () => {
      const options = getBellOptions(mockOidcConfig)

      const params = options.providerParams()
      expect(params).toEqual({
        serviceId: DEFAULT_CONFIG['defraId.serviceId']
      })
    })

    test('throws error if credentials are undefined after retrieving from Bell OAuth provider', () => {
      const options = getBellOptions(mockOidcConfig)
      const credentials = undefined

      expect(() => {
        options.provider.profile(credentials)
      }).toThrow('No credentials received from Bell OAuth provider')
    })

    test('throws error if token is missing after retrieving from Bell OAuth provider', () => {
      const options = getBellOptions(mockOidcConfig)
      const credentials = { profile: {} }

      expect(() => {
        options.provider.profile(credentials)
      }).toThrow('No token received from Defra Identity')
    })

    test('throws error if JWT decoding fails', () => {
      const options = getBellOptions(mockOidcConfig)
      const credentials = { token: 'a_test_token' }
      Jwt.token.decode.mockImplementation(() => {
        throw new Error('JWT decode error')
      })
      expect(() => {
        options.provider.profile(credentials)
      }).toThrow('JWT decode error')
    })

    test('logs JWT decode error with detailed information', () => {
      const options = getBellOptions(mockOidcConfig)
      const credentials = { token: 'a_test_token' }
      const jwtError = createMockError('Invalid JWT structure', 'Error', 'Error: Invalid JWT structure\n    at decode')

      Jwt.token.decode.mockImplementation(() => {
        throw jwtError
      })

      expect(() => {
        options.provider.profile(credentials)
      }).toThrow('Invalid JWT structure')

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.SIGN_IN_FAILURE, {
        ...LOG_MESSAGES.signInFailure.baseFields,
        error: 'JWT decode failed: Invalid JWT structure',
        step: LOG_MESSAGES.signInFailure.steps.JWT_DECODE_ERROR,
        jwtError: {
          message: 'Invalid JWT structure',
          stack: 'Error: Invalid JWT structure\n    at decode',
          tokenLength: 'a_test_token'.length
        }
      })
    })

    test('logs JWT decode error with tokenLength 0 when credentials.token becomes falsy during decode', () => {
      const options = getBellOptions(mockOidcConfig)
      const credentials = {
        get token() {
          if (this._callCount === undefined) {
            this._callCount = 0
          }
          this._callCount++
          return this._callCount === 1 ? 'valid-token' : null
        }
      }

      const jwtError = createMockError(
        'Token processing error',
        'Error',
        'Error: Token processing error\n    at decode'
      )

      Jwt.token.decode.mockImplementation(() => {
        throw jwtError
      })

      expect(() => {
        options.provider.profile(credentials)
      }).toThrow('Token processing error')

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.SIGN_IN_FAILURE, {
        ...LOG_MESSAGES.signInFailure.baseFields,
        error: 'JWT decode failed: Token processing error',
        step: LOG_MESSAGES.signInFailure.steps.JWT_DECODE_ERROR,
        jwtError: {
          message: 'Token processing error',
          stack: 'Error: Token processing error\n    at decode',
          tokenLength: 0
        }
      })
    })

    test('logs empty payload error with detailed debugging info', () => {
      const options = getBellOptions(mockOidcConfig)
      const credentials = { token: 'test-token' }
      const decoded = { decoded: null }

      Jwt.token.decode.mockReturnValue(decoded)

      expect(() => {
        options.provider.profile(credentials)
      }).toThrow('Failed to extract payload from JWT token')

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.SIGN_IN_FAILURE, {
        ...LOG_MESSAGES.signInFailure.baseFields,
        error: 'JWT payload is empty or invalid',
        step: LOG_MESSAGES.signInFailure.steps.EMPTY_PAYLOAD,
        decodingDetails: {
          decoded: true,
          decodedDecoded: false,
          payload: undefined,
          payloadType: 'undefined'
        }
      })
    })

    test('logs missing fields error with validation details', () => {
      const options = getBellOptions(mockOidcConfig)
      const credentials = { token: 'test-token' }

      Jwt.token.decode.mockReturnValue({
        decoded: {
          payload: MOCK_USERS.incomplete
        }
      })

      expect(() => {
        options.provider.profile(credentials)
      }).toThrow('Missing required fields in JWT payload: contactId, lastName')

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.SIGN_IN_FAILURE, {
        ...LOG_MESSAGES.signInFailure.baseFields,
        error: 'Missing required JWT payload fields: contactId, lastName',
        step: LOG_MESSAGES.signInFailure.steps.MISSING_FIELDS,
        payloadValidation: {
          requiredFields: ['contactId', 'firstName', 'lastName'],
          missingFields: ['contactId', 'lastName'],
          presentFields: ['firstName'],
          contactId: undefined,
          firstName: MOCK_USERS.incomplete.firstName,
          lastName: undefined
        }
      })
    })

    test('logs profile processing error and sets alreadyLogged flag', () => {
      const options = getBellOptions(mockOidcConfig)
      const credentials = { token: 'test-token' }

      Jwt.token.decode.mockImplementation(() => {
        throw createMockError(
          'Unexpected processing error',
          'ProcessingError',
          'Error: Unexpected processing error\n    at process'
        )
      })

      let thrownError
      try {
        options.provider.profile(credentials)
      } catch (error) {
        thrownError = error
      }

      expect(thrownError.alreadyLogged).toBe(true)

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.SIGN_IN_FAILURE, {
        ...LOG_MESSAGES.signInFailure.baseFields,
        error: 'JWT decode failed: Unexpected processing error',
        step: LOG_MESSAGES.signInFailure.steps.JWT_DECODE_ERROR,
        jwtError: {
          message: 'Unexpected processing error',
          stack: 'Error: Unexpected processing error\n    at process',
          tokenLength: 10
        }
      })

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.SIGN_IN_FAILURE, {
        ...LOG_MESSAGES.signInFailure.baseFields,
        error: 'Bell profile processing failed: Unexpected processing error',
        step: LOG_MESSAGES.signInFailure.steps.PROCESSING_ERROR,
        errorDetails: {
          message: 'Unexpected processing error',
          stack: expect.any(String),
          name: 'ProcessingError',
          alreadyLogged: undefined
        },
        credentialsState: {
          received: true,
          hasToken: true,
          tokenLength: 10
        }
      })
    })

    test('location function logs and handles general errors', () => {
      const options = getBellOptions(mockOidcConfig)
      const mockRequest = { ...MOCK_REQUESTS.authPage }

      config.get.mockImplementation((key) => {
        if (key === 'defraId.redirectUrl') {
          throw createMockError('Config read error')
        }
        return DEFAULT_CONFIG[key]
      })

      let thrownError
      try {
        options.location(mockRequest)
      } catch (error) {
        thrownError = error
      }

      expect(thrownError.alreadyLogged).toBe(true)
      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.SIGN_IN_FAILURE, {
        ...LOG_MESSAGES.signInFailure.baseFields,
        error: 'Bell location function failed: Config read error',
        step: LOG_MESSAGES.signInFailure.steps.LOCATION_FUNCTION_ERROR,
        locationError: {
          message: 'Config read error',
          stack: expect.any(String),
          name: 'Error',
          requestPath: '/auth/sign-in',
          requestMethod: 'POST'
        }
      })
    })
  })

  test('throws error if payload is undefined', () => {
    const options = getBellOptions(mockOidcConfig)
    const credentials = { token: 'test-token' }

    Jwt.token.decode.mockReturnValueOnce(undefined)

    expect(() => {
      options.provider.profile(credentials)
    }).toThrow('Failed to extract payload from JWT token')
  })

  test('throws error if payload is missing required fields', () => {
    const options = getBellOptions(mockOidcConfig)
    const credentials = { token: 'test-token' }

    Jwt.token.decode.mockReturnValueOnce({
      decoded: {
        payload: {}
      }
    })

    expect(() => {
      options.provider.profile(credentials)
    }).toThrow('Missing required fields in JWT payload: contactId, firstName, lastName')
  })

  describe('getCookieOptions', () => {
    test('returns the correct cookie options', () => {
      const options = getCookieOptions()

      expect(options.cookie.password).toBe(DEFAULT_CONFIG['session.cookie.password'])
      expect(options.cookie.isSecure).toBe(false)
      expect(options.cookie.isSameSite).toBe('Lax')
    })

    test('redirectTo function returns correct URL', () => {
      const options = getCookieOptions()
      const mockRequest = {
        url: {
          pathname: MOCK_REQUESTS.withRedirect.url.pathname,
          search: MOCK_REQUESTS.withRedirect.url.search
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
        if (key === 'defraId.refreshTokens') {
          return false
        }

        const mockConfig = {
          'defraId.enabled': true,
          'session.cookie.password': DEFAULT_CONFIG['session.cookie.password'],
          isProduction: false
        }
        return mockConfig[key]
      })

      const userSession = { ...MOCK_USERS.user123 }

      server.app.cache.get.mockResolvedValue(userSession)
      Jwt.token.verifyTime.mockImplementation(() => {
        throw new Error('Token expired')
      })

      const mockRequest = { server, path: '/protected-route' }
      const result = await options.validate(mockRequest, {
        sessionId: 'test-session'
      })

      expect(refreshTokens).not.toHaveBeenCalled()
      expect(result).toEqual({ isValid: false })

      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.SESSION_EXPIRED,
        {
          userId: MOCK_USERS.user123.contactId,
          sessionId: 'test-session',
          path: '/protected-route',
          reason: LOG_MESSAGES.sessionExpired.reasons.TOKEN_EXPIRED_REFRESH_DISABLED,
          error: 'Token expired'
        },
        mockRequest
      )
    })

    test('validate function logs session not found in cache', async () => {
      const options = getCookieOptions()
      server.app.cache.get.mockResolvedValue(null)

      const mockRequest = { server, path: '/dashboard' }
      const result = await options.validate(mockRequest, {
        sessionId: 'missing-session'
      })

      expect(result).toEqual({ isValid: false })
      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.SESSION_EXPIRED,
        {
          userId: 'unknown',
          sessionId: 'missing-session',
          path: '/dashboard',
          reason: LOG_MESSAGES.sessionExpired.reasons.NOT_FOUND
        },
        mockRequest
      )
    })

    test('validate function handles token refresh failure', async () => {
      const options = getCookieOptions()

      config.get.mockImplementation((key) => {
        const mockConfig = {
          'defraId.enabled': true,
          'defraId.refreshTokens': true,
          'session.cookie.password': DEFAULT_CONFIG['session.cookie.password'],
          'session.cookie.secure': false,
          isProduction: false
        }
        return mockConfig[key]
      })

      const userSession = { ...MOCK_USERS.user456 }

      server.app.cache.get.mockResolvedValue(userSession)
      Jwt.token.verifyTime.mockImplementation(() => {
        throw new Error('Token expired')
      })

      refreshTokens.mockRejectedValue(new Error('Refresh service unavailable'))

      const mockRequest = { server }
      const result = await options.validate(mockRequest, {
        sessionId: 'test-session'
      })

      expect(result).toEqual({ isValid: false })

      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE,
        {
          userId: MOCK_USERS.user456.contactId,
          error: 'Refresh service unavailable',
          step: LOG_MESSAGES.tokenVerification.steps.REFRESH_FAILED,
          originalTokenError: 'Token expired'
        },
        mockRequest
      )
    })

    test('validate function logs successful token refresh', async () => {
      const options = getCookieOptions()

      config.get.mockImplementation((key) => {
        const mockConfig = {
          'defraId.enabled': true,
          'defraId.refreshTokens': true,
          'session.cookie.password': DEFAULT_CONFIG['session.cookie.password'],
          'session.cookie.secure': false,
          isProduction: false
        }
        return mockConfig[key]
      })

      const userSession = { ...MOCK_USERS.user789 }

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

      expect(result).toEqual({ isValid: true, credentials: userSession })
      expect(userSession.token).toBe('new-token')
      expect(userSession.refreshToken).toBe('new-refresh-token')

      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS,
        {
          userId: MOCK_USERS.user789.contactId,
          organisationId: MOCK_USERS.user789.organisationId,
          step: LOG_MESSAGES.tokenVerification.steps.REFRESH_SUCCESS
        },
        mockRequest
      )
    })
  })

  describe('Setting up users details', () => {
    let server

    beforeEach(async () => {
      server = Hapi.server()

      // Mock the config to provide required values for testing
      config.get.mockImplementation((key) => {
        const testConfig = {
          ...DEFAULT_CONFIG,
          'session.cookie.password': 'at-least-32-characters-long-password-for-testing-purposes-only'
        }
        return testConfig[key]
      })

      // Register required plugins with proper configuration
      await server.register([
        Bell,
        Cookie,
        {
          plugin: Yar,
          options: {
            storeBlank: false,
            cookieOptions: {
              password: 'at-least-32-characters-long-password-for-testing-purposes-only',
              isSecure: false
            }
          }
        }
      ])

      // Mock the cache that auth plugin expects
      server.app.cache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(true)
      }

      // Register auth plugin
      await server.register(AuthPlugin)
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    // Helper function to create test route with dynamic relationships
    const createTestRoute = (currentRelationshipId, relationships) => {
      return {
        method: 'GET',
        path: '/test-auth',
        options: {
          auth: false // Disable auth for this test route
        },
        handler: (request, h) => {
          // Manually simulate an authenticated request
          request.auth = {
            isAuthenticated: true,
            credentials: {
              profile: {
                contactId: '12345',
                firstName: 'John',
                lastName: 'Doe',
                currentRelationshipId,
                relationships
              }
            }
          }

          // Manually call the mapPayloadToProfile function
          mapPayloadToProfile(request, h)

          return {
            credentials: request.auth.credentials,
            isAuthenticated: request.auth.isAuthenticated
          }
        }
      }
    }

    test('should transform credentials through manual mapPayloadToProfile call', async () => {
      const relationships = ['123456:987654:Farm 1:1234567890:relationship:relationshipLoa']
      const currentRelationshipId = '123456'
      server.route(createTestRoute(currentRelationshipId, relationships))

      const response = await server.inject({
        method: 'GET',
        url: '/test-auth'
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)

      expect(payload.credentials).toEqual({
        profile: expect.any(Object),
        sbi: '987654',
        crn: '12345',
        name: 'John Doe',
        organisationId: '987654',
        organisationName: 'Farm 1',
        relationshipId: '123456'
      })
    })

    test('should handle multiple relationships and find correct current one', async () => {
      const relationships = [
        '123456-farm-1:987654:Farm 1:1234567890:relationship:relationshipLoa',
        '789012-farm-2:555666:Farm 2:9876543210:relationship:relationshipLoa'
      ]
      const currentRelationshipId = '123456-farm-1'
      server.route(createTestRoute(currentRelationshipId, relationships))

      const response = await server.inject({
        method: 'GET',
        url: '/test-auth'
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)

      expect(payload.credentials).toEqual({
        profile: expect.any(Object),
        sbi: '987654',
        crn: '12345',
        name: 'John Doe',
        organisationId: '987654',
        organisationName: 'Farm 1',
        relationshipId: '123456-farm-1'
      })
    })

    test('should through an error is the relationship is not in the correct format of at least 6 elements', async () => {
      const relationships = ['123456:987654:Farm 1:1234567890']
      const currentRelationshipId = '123456'
      server.route(createTestRoute(currentRelationshipId, relationships))

      const response = await server.inject({
        method: 'GET',
        url: '/test-auth'
      })

      expect(response.statusCode).toBe(500)
    })

    test('should handle different organisation details', async () => {
      const relationships = ['123456-farm1:111222:Test Organisation:5555555555:relationship:relationshipLoa']
      const currentRelationshipId = '123456-farm1'
      server.route(createTestRoute(currentRelationshipId, relationships))

      const response = await server.inject({
        method: 'GET',
        url: '/test-auth'
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)

      expect(payload.credentials).toEqual({
        profile: expect.any(Object),
        sbi: '111222',
        crn: '12345',
        name: 'John Doe',
        organisationId: '111222',
        organisationName: 'Test Organisation',
        relationshipId: '123456-farm1'
      })
    })

    // You can also create a parameterized test using test.each for multiple scenarios
    test.each([
      {
        scenario: 'single relationship',
        currentRelationshipId: '123456',
        relationships: ['123456:987654:Farm 1:1234567890:relationship:relationshipLoa'],
        expectedSbi: '987654',
        expectedOrgName: 'Farm 1'
      },
      {
        scenario: 'different organisation',
        currentRelationshipId: '123456',
        relationships: ['123456:555777:Another Farm:9999999999:relationship:relationshipLoa'],
        expectedSbi: '555777',
        expectedOrgName: 'Another Farm'
      },
      {
        scenario: 'organisation with spaces in name',
        currentRelationshipId: '123456',
        relationships: ['123456:333444:My Test Farm Ltd:1111111111:relationship:relationshipLoa'],
        expectedSbi: '333444',
        expectedOrgName: 'My Test Farm Ltd'
      },
      {
        scenario: 'organisation with single colon in name',
        currentRelationshipId: '123456',
        relationships: ['123456:333444:Farm 1: Mr Bloggs:1111111111:relationship:relationshipLoa'],
        expectedSbi: '333444',
        expectedOrgName: 'Farm 1: Mr Bloggs'
      },
      {
        scenario: 'organisation with multiple colon in name',
        currentRelationshipId: '123456',
        relationships: [
          '123456:333444:Farm 1: Mr Bloggs: Boggy Patch: In the Valley:1111111111:relationship:relationshipLoa'
        ],
        expectedSbi: '333444',
        expectedOrgName: 'Farm 1: Mr Bloggs: Boggy Patch: In the Valley'
      },
      {
        scenario: 'Supports instances where relationship id is UUID',
        currentRelationshipId: 'b8027742-53e7-409a-93dd-3e80a296a986',
        relationships: [
          'b8027742-53e7-409a-93dd-3e80a296a986:333444:Farm 1: Mr Bloggs: Boggy Patch: In the Valley:1111111111:relationship:relationshipLoa'
        ],
        expectedSbi: '333444',
        expectedOrgName: 'Farm 1: Mr Bloggs: Boggy Patch: In the Valley'
      },
      {
        scenario: 'Supports instances where SBI id is UUID',
        currentRelationshipId: 'b8027742-53e7-409a-93dd-3e80a296a986',
        relationships: [
          'b8027742-53e7-409a-93dd-3e80a296a986:c97d000d-0d31-4fb1-96d5-82b9977efea6:Farm 1: Mr Bloggs: Boggy Patch: In the Valley:1111111111:relationship:relationshipLoa'
        ],
        expectedSbi: 'c97d000d-0d31-4fb1-96d5-82b9977efea6',
        expectedOrgName: 'Farm 1: Mr Bloggs: Boggy Patch: In the Valley'
      }
    ])('should handle $scenario', async ({ currentRelationshipId, relationships, expectedSbi, expectedOrgName }) => {
      server.route(createTestRoute(currentRelationshipId, relationships))

      const response = await server.inject({
        method: 'GET',
        url: '/test-auth'
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)

      expect(payload.credentials.sbi).toBe(expectedSbi)
      expect(payload.credentials.organisationId).toBe(expectedSbi)
      expect(payload.credentials.organisationName).toBe(expectedOrgName)
    })
  })
})
