import { vi } from 'vitest'
import { mockSimpleRequest } from '~/src/__mocks__/hapi-mocks.js'

const mockReadFileSync = vi.fn()
const mockLog = vi.fn()
let MockLogCodes

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: mockReadFileSync
  }
})
vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  const helper = mockLogHelper()
  MockLogCodes = helper.LogCodes
  return {
    ...helper,
    log: (...args) => mockLog(...args)
  }
})
const mockSbiStoreGet = vi.fn(() => 106284736)
vi.mock('~/src/server/sbi/state.js', () => ({
  sbiStore: {
    get: mockSbiStoreGet
  }
}))

vi.mock('~/src/config/config.js', async () => {
  const { mockConfig } = await import('~/src/__mocks__')
  return mockConfig({
    assetPath: '/public',
    root: '/test/root',
    serviceName: 'Manage land-based actions',
    'defraId.enabled': true,
    'cookieConsent.cookiePolicyUrl': '/cookies',
    'cookieConsent.cookieName': 'cookie_consent',
    'cookieConsent.expiryDays': 365,
    'googleAnalytics.trackingId': undefined,
    'session.cookie.ttl': 14400000 // 4 hours in milliseconds
  })
})

vi.mock('~/src/config/nunjucks/context/build-navigation.js', () => ({
  buildNavigation: () => [
    {
      isActive: true,
      text: 'Home',
      url: '/'
    }
  ]
}))

const getExpectedContext = () => ({
  assetPath: '/public/assets/rebrand',
  breadcrumbs: [],
  getAssetPath: expect.any(Function),
  navigation: [
    {
      isActive: true,
      text: 'Home',
      url: '/'
    }
  ],
  serviceName: 'Manage land-based actions',
  serviceUrl: '/',
  defraIdEnabled: expect.any(Boolean),
  cdpEnvironment: undefined,
  gaTrackingId: undefined,
  cookiePolicyUrl: expect.any(String),
  cookieConsentName: expect.any(String),
  cookieConsentExpiryDays: expect.any(Number),
  sessionCookieTtl: expect.any(Number),
  cookieBannerConfig: expect.any(Object),
  cookieBannerNoscriptConfig: expect.any(Object),
  auth: {
    isAuthenticated: false,
    name: undefined,
    role: undefined,
    organisationId: undefined,
    organisationName: undefined,
    crn: undefined,
    relationshipId: undefined,
    sbi: 106284736
  }
})

const getMinimalFallbackContext = () => ({
  assetPath: '/public/assets/rebrand',
  serviceName: 'Manage land-based actions',
  serviceUrl: '/',
  defraIdEnabled: expect.any(Boolean),
  cdpEnvironment: undefined,
  gaTrackingId: undefined,
  cookiePolicyUrl: expect.any(String),
  cookieConsentName: expect.any(String),
  cookieConsentExpiryDays: expect.any(Number),
  sessionCookieTtl: expect.any(Number),
  cookieBannerConfig: expect.any(Object),
  cookieBannerNoscriptConfig: expect.any(Object),
  auth: {
    isAuthenticated: false,
    sbi: null,
    crn: null,
    name: null,
    organisationId: null,
    organisationName: null,
    relationshipId: null,
    role: null
  },
  breadcrumbs: [],
  navigation: [],
  getAssetPath: expect.any(Function)
})

const setupManifestSuccess = () => {
  mockReadFileSync.mockReturnValue(`{
    "application.js": "javascripts/application.js",
    "stylesheets/application.scss": "stylesheets/application.css"
  }`)
}

const setupManifestError = (errorMessage = 'File not found') => {
  mockReadFileSync.mockImplementation(() => {
    throw new Error(errorMessage)
  })
}

const setupSbiStoreError = (errorMessage = 'SBI store access failed') => {
  mockSbiStoreGet.mockImplementation(() => {
    throw new Error(errorMessage)
  })
}

const importContext = async () => {
  vi.resetModules()
  return await import('~/src/config/nunjucks/context/context.js')
}

const createAuthRequest = (credentials, cacheValue = null) => ({
  ...mockSimpleRequest({ path: '/' }),
  auth: { isAuthenticated: true, credentials },
  server: {
    app: {
      cache: {
        get: vi.fn().mockReturnValue(cacheValue)
      }
    }
  }
})

describe('context', () => {
  const mockRequest = mockSimpleRequest({ path: '/' })

  afterEach(() => {
    vi.clearAllMocks()
    mockSbiStoreGet.mockReturnValue(106284736)
  })

  describe('Webpack manifest file handling', () => {
    test('Should provide expected context when manifest read succeeds', async () => {
      setupManifestSuccess()

      const contextImport = await importContext()
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult).toEqual(getExpectedContext())
    })

    test('Should log error when webpack manifest file read fails', async () => {
      setupManifestError('File not found')

      const contextImport = await importContext()
      await contextImport.context(mockRequest)

      expect(mockLog).toHaveBeenCalledWith(
        MockLogCodes.SYSTEM.SERVER_ERROR,
        {
          errorMessage: expect.stringContaining('Webpack assets-manifest.json not found')
        },
        mockRequest
      )
    })

    test('Should cache webpack manifest file', async () => {
      const contextImport = await import('~/src/config/nunjucks/context/context.js')

      const contextResult1 = await contextImport.context(mockRequest)
      const contextResult2 = await contextImport.context(mockRequest)

      expect(contextResult1.getAssetPath('application.js')).toBe(contextResult2.getAssetPath('application.js'))
      expect(typeof contextResult1.getAssetPath).toBe('function')
      expect(typeof contextResult2.getAssetPath).toBe('function')
    })
  })

  describe('Asset path resolution', () => {
    test.each([
      { asset: 'application.js', expected: '/public/application.js' },
      { asset: 'styles.css', expected: '/public/styles.css' }
    ])('Should provide asset path for $asset', async ({ asset, expected }) => {
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(typeof contextResult.getAssetPath).toBe('function')
      expect(contextResult.getAssetPath(asset)).toBe(expected)
    })

    test('Should provide fallback asset path for invalid manifest entry', async () => {
      setupManifestSuccess()

      const contextImport = await importContext()
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath('an-image.png')).toBe('/public/an-image.png')
    })

    test('Should handle asset path resolution gracefully', async () => {
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath('application.js')).toMatch(/\/public\/.*application\.js/)
      expect(contextResult.getAssetPath('stylesheets/application.scss')).toMatch(
        /\/public\/.*stylesheets\/application\.scss/
      )

      const path1 = contextResult.getAssetPath('test.js')
      const path2 = contextResult.getAssetPath('test.js')
      expect(path1).toBe(path2)
    })

    test('Should fall back to default asset path for missing manifest entry', async () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          'application.js': 'javascripts/application.js'
        })
      )

      const contextImport = await importContext()
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath('missing-asset.png')).toBe('/public/missing-asset.png')
    })
  })

  describe('Error handling scenarios', () => {
    test('Should return minimal context when manifest read error occurs', async () => {
      setupManifestError('File read failed')

      const contextImport = await importContext()
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult).toMatchObject({
        assetPath: '/public/assets/rebrand',
        serviceName: 'Manage land-based actions',
        cookiePolicyUrl: '/cookies',
        cookieConsentName: 'cookie_consent',
        cookieConsentExpiryDays: 365
      })

      expect(mockLog).toHaveBeenCalledWith(
        MockLogCodes.SYSTEM.SERVER_ERROR,
        {
          errorMessage: expect.stringContaining('Webpack assets-manifest.json not found')
        },
        mockRequest
      )
    })

    test('Should log error and continue when manifest read fails', async () => {
      setupManifestError('Manifest not found')

      const contextImport = await importContext()
      const contextResult = await contextImport.context(mockRequest)

      expect(mockLog).toHaveBeenCalledWith(
        MockLogCodes.SYSTEM.SERVER_ERROR,
        {
          errorMessage: expect.stringContaining('Webpack assets-manifest.json not found')
        },
        mockRequest
      )
      expect(contextResult.getAssetPath('test.js')).toBe('/public/test.js')
    })

    test('Should return minimal context and log error when main function throws', async () => {
      setupSbiStoreError()
      mockReadFileSync.mockReturnValue('{}')

      const contextImport = await importContext()
      const contextResult = await contextImport.context(mockRequest)

      expect(mockLog).toHaveBeenCalledWith(
        MockLogCodes.SYSTEM.SERVER_ERROR,
        {
          errorMessage: expect.stringContaining('Error building context: SBI store access failed')
        },
        mockRequest
      )
      expect(contextResult).toEqual(getMinimalFallbackContext())
      expect(contextResult).toEqual(getMinimalFallbackContext())
    })

    test.each([
      { asset: 'test-asset.js', expected: '/public/test-asset.js' },
      { asset: 'images/logo.png', expected: '/public/images/logo.png' }
    ])('Should provide working fallback getAssetPath for $asset', async ({ asset, expected }) => {
      setupSbiStoreError()
      mockReadFileSync.mockReturnValue('{}')

      const contextImport = await importContext()
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath(asset)).toBe(expected)
    })
  })

  describe('Session and authentication handling', () => {
    test('Should log cache retrieval error and fallback to empty session', async () => {
      // Create a mock cache that throws an error
      const mockCache = {
        get: vi.fn().mockImplementation(() => {
          throw new Error('Cache retrieval failed')
        })
      }

      const requestWithAuth = {
        ...mockRequest,
        auth: { isAuthenticated: true, credentials: { sessionId: 'test-session' } },
        server: {
          app: {
            cache: mockCache
          }
        }
      }

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(requestWithAuth)

      expect(mockLog).toHaveBeenCalledWith(
        MockLogCodes.AUTH.SIGN_IN_FAILURE,
        {
          userId: 'unknown',
          errorMessage: expect.stringContaining('Cache retrieval failed for session test-session'),
          step: 'context_cache_retrieval'
        },
        expect.objectContaining({
          auth: expect.objectContaining({
            isAuthenticated: true,
            credentials: expect.objectContaining({
              sessionId: expect.any(String) // Allow for sessionId to be preserved or nullified
            })
          }),
          method: 'GET',
          path: '/',
          server: expect.objectContaining({
            app: expect.objectContaining({
              cache: expect.objectContaining({
                get: expect.any(Function)
              })
            })
          })
        })
      )
      expect(contextResult.auth).toEqual({
        isAuthenticated: true,
        sbi: 106284736,
        name: undefined,
        organisationId: undefined,
        role: undefined
      })
    })

    test('Should provide correct auth properties when authenticated', async () => {
      const credentials = {
        sbi: '106284736',
        name: 'John Doe',
        organisationId: 'org123',
        organisationName: ' Farm 1',
        role: 'admin',
        sessionId: 'valid-session-id'
      }
      const request = createAuthRequest(credentials, {
        sbi: '106284736',
        name: 'John Doe',
        organisationId: 'org123',
        role: 'admin'
      })

      const contextImport = await importContext()
      const contextResult = await contextImport.context(request)

      expect(contextResult.auth).toEqual({
        isAuthenticated: true,
        sbi: '106284736',
        name: 'John Doe',
        organisationId: 'org123',
        organisationName: ' Farm 1',
        role: 'admin'
      })
    })

    test('Should handle cache returning null and use empty session', async () => {
      const request = createAuthRequest({ sessionId: 'valid-session-id' }, null)

      const contextImport = await importContext()
      const contextResult = await contextImport.context(request)

      expect(contextResult.auth).toEqual({
        isAuthenticated: true,
        sbi: 106284736,
        name: undefined,
        organisationId: undefined,
        role: undefined
      })
    })

    test('Should handle cache error and log unknown when sessionId becomes falsy', async () => {
      const credentials = { sessionId: 'valid-session' }
      const requestWithAuth = createAuthRequest(credentials, null)
      requestWithAuth.server.app.cache.get.mockImplementation(() => {
        credentials.sessionId = null
        throw new Error('Cache retrieval failed')
      })

      const contextImport = await importContext()
      const contextResult = await contextImport.context(requestWithAuth)

      expect(mockLog).toHaveBeenCalledWith(
        MockLogCodes.AUTH.SIGN_IN_FAILURE,
        {
          userId: 'unknown',
          errorMessage: expect.stringContaining('Cache retrieval failed for session unknown'),
          step: 'context_cache_retrieval'
        },
        expect.objectContaining({
          auth: expect.objectContaining({
            isAuthenticated: true,
            credentials: expect.objectContaining({
              sessionId: null
            })
          }),
          method: 'GET',
          path: '/',
          server: expect.objectContaining({
            app: expect.objectContaining({
              cache: expect.objectContaining({
                get: expect.any(Function)
              })
            })
          })
        })
      )
      expect(contextResult.auth).toEqual({
        isAuthenticated: true,
        sbi: 106284736,
        name: undefined,
        organisationId: undefined,
        role: undefined
      })
    })
  })

  describe('Cookie consent configuration in context', () => {
    test('includes cookie consent config values', async () => {
      setupManifestSuccess()

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult).toMatchObject({
        cookiePolicyUrl: '/cookies',
        cookieConsentName: 'cookie_consent',
        cookieConsentExpiryDays: 365,
        gaTrackingId: undefined
      })
    })

    test('includes cookie config in minimal fallback context', async () => {
      setupSbiStoreError()
      mockReadFileSync.mockReturnValue('{}')

      const contextImport = await importContext()
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.cookiePolicyUrl).toBe('/cookies')
      expect(contextResult.cookieConsentName).toBe('cookie_consent')
      expect(contextResult.cookieConsentExpiryDays).toBe(365)
    })

    test('includes cookieBannerConfig with correct structure', async () => {
      setupManifestSuccess()

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.cookieBannerConfig).toBeDefined()
      expect(contextResult.cookieBannerConfig.ariaLabel).toBe('Cookies on Manage land-based actions')
      expect(contextResult.cookieBannerConfig.hidden).toBe(true)
      expect(contextResult.cookieBannerConfig.attributes['data-cookie-name']).toBe('cookie_consent')
      expect(contextResult.cookieBannerConfig.attributes['data-cookie-policy-url']).toBe('/cookies')
      expect(contextResult.cookieBannerConfig.messages).toHaveLength(1)
      expect(contextResult.cookieBannerConfig.messages[0].actions).toHaveLength(3)
    })

    test('includes cookieBannerNoscriptConfig with correct structure', async () => {
      setupManifestSuccess()

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.cookieBannerNoscriptConfig).toBeDefined()
      expect(contextResult.cookieBannerNoscriptConfig.ariaLabel).toBe('Cookies on Manage land-based actions')
      expect(contextResult.cookieBannerNoscriptConfig.attributes['data-nosnippet']).toBe('')
      expect(contextResult.cookieBannerNoscriptConfig.messages).toHaveLength(1)
    })

    test('includes cookie banner configs in fallback context', async () => {
      setupSbiStoreError()
      mockReadFileSync.mockReturnValue('{}')

      const contextImport = await importContext()
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.cookieBannerConfig).toBeDefined()
      expect(contextResult.cookieBannerConfig.ariaLabel).toBe('Cookies on Manage land-based actions')
      expect(contextResult.cookieBannerConfig.attributes['data-cookie-name']).toBe('cookie_consent')

      expect(contextResult.cookieBannerNoscriptConfig).toBeDefined()
      expect(contextResult.cookieBannerNoscriptConfig.ariaLabel).toBe('Cookies on Manage land-based actions')
    })
  })

  describe('Session cookie TTL', () => {
    test('includes sessionCookieTtl in context', async () => {
      setupManifestSuccess()

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.sessionCookieTtl).toBeDefined()
      expect(contextResult.sessionCookieTtl).toBe(14400000)
    })

    test('includes sessionCookieTtl in fallback context', async () => {
      setupSbiStoreError()
      mockReadFileSync.mockReturnValue('{}')

      const contextImport = await importContext()
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.sessionCookieTtl).toBeDefined()
      expect(contextResult.sessionCookieTtl).toBe(14400000)
    })
  })
})
