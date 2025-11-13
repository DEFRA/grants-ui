import { vi } from 'vitest'
import { mockLogHelperWithCustomCodes } from '~/src/__mocks__'
import { mockSimpleRequest } from '~/src/__mocks__/hapi-mocks.js'

const mockReadFileSync = vi.fn()
const mockLog = vi.fn()

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: mockReadFileSync
  }
})
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  ...mockLogHelperWithCustomCodes({
    SYSTEM: {
      SERVER_ERROR: 'SYSTEM_SERVER_ERROR'
    },
    AUTH: {
      SIGN_IN_FAILURE: 'AUTH_SIGN_IN_FAILURE'
    }
  }),
  log: (...args) => mockLog(...args)
}))
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
    'googleAnalytics.trackingId': undefined
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

describe('context', () => {
  const mockRequest = mockSimpleRequest({ path: '/' })

  afterEach(() => {
    vi.clearAllMocks()
    mockSbiStoreGet.mockReturnValue(106284736)
  })

  describe('Webpack manifest file handling', () => {
    test('Should provide expected context when manifest read succeeds', async () => {
      setupManifestSuccess()

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult).toEqual(getExpectedContext())
    })

    test('Should log error when webpack manifest file read fails', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found')
      })

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      await contextImport.context(mockRequest)

      expect(mockLog).toHaveBeenCalledWith(
        'SYSTEM_SERVER_ERROR',
        {
          error: expect.stringContaining('Webpack assets-manifest.json not found')
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
    test('Should provide asset path functionality', async () => {
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(typeof contextResult.getAssetPath).toBe('function')

      expect(contextResult.getAssetPath('application.js')).toBe('/public/application.js')
      expect(contextResult.getAssetPath('styles.css')).toBe('/public/styles.css')
    })

    test('Should provide fallback asset path for invalid manifest entry', async () => {
      setupManifestSuccess()

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
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
      expect(path1).toBe(path2) // Should be consistent
    })

    test('Should fall back to default asset path for missing manifest entry', async () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          'application.js': 'javascripts/application.js'
        })
      )

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath('missing-asset.png')).toBe('/public/missing-asset.png')
    })
  })

  describe('Error handling scenarios', () => {
    test('Should return minimal context when manifest read error occurs', async () => {
      setupManifestError('File read failed')

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult).toEqual({
        assetPath: '/public/assets/rebrand',
        breadcrumbs: [],
        getAssetPath: expect.any(Function),
        navigation: expect.any(Array),
        serviceName: 'Manage land-based actions',
        serviceUrl: '/',
        defraIdEnabled: expect.any(Boolean),
        cdpEnvironment: undefined,
        gaTrackingId: undefined,
        cookiePolicyUrl: '/cookies',
        cookieConsentName: 'cookie_consent',
        cookieConsentExpiryDays: 365,
        cookieBannerConfig: expect.any(Object),
        cookieBannerNoscriptConfig: expect.any(Object),
        auth: {
          isAuthenticated: false,
          name: undefined,
          organisationId: undefined,
          organisationName: undefined,
          crn: undefined,
          relationshipId: undefined,
          role: undefined,
          sbi: 106284736
        }
      })

      expect(mockLog).toHaveBeenCalledWith(
        'SYSTEM_SERVER_ERROR',
        {
          error: expect.stringContaining('Webpack assets-manifest.json not found')
        },
        mockRequest
      )
    })

    test('Should log error and continue when manifest read fails', async () => {
      setupManifestError('Manifest not found')

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(mockLog).toHaveBeenCalledWith(
        'SYSTEM_SERVER_ERROR',
        {
          error: expect.stringContaining('Webpack assets-manifest.json not found')
        },
        mockRequest
      )
      expect(contextResult.getAssetPath('test.js')).toBe('/public/test.js')
    })

    test('Should return minimal context and log error when main function throws', async () => {
      setupSbiStoreError()
      mockReadFileSync.mockReturnValue('{}')

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(mockLog).toHaveBeenCalledWith(
        'SYSTEM_SERVER_ERROR',
        {
          error: expect.stringContaining('Error building context: SBI store access failed')
        },
        mockRequest
      )
      expect(contextResult).toEqual(getMinimalFallbackContext())
      expect(contextResult).toEqual(getMinimalFallbackContext())
    })

    test('Should provide working fallback getAssetPath function', async () => {
      setupSbiStoreError()
      mockReadFileSync.mockReturnValue('{}')

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath('test-asset.js')).toBe('/public/test-asset.js')
      expect(contextResult.getAssetPath('images/logo.png')).toBe('/public/images/logo.png')
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
        'AUTH_SIGN_IN_FAILURE',
        {
          userId: 'unknown',
          error: expect.stringContaining('Cache retrieval failed for session test-session'),
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
      const request = {
        ...mockRequest,
        auth: {
          isAuthenticated: true,
          credentials: {
            sbi: '106284736',
            name: 'John Doe',
            organisationId: 'org123',
            organisationName: ' Farm 1',
            role: 'admin',
            sessionId: 'valid-session-id'
          }
        },
        server: {
          app: {
            cache: {
              get: vi.fn().mockReturnValue({
                sbi: '106284736',
                name: 'John Doe',
                organisationId: 'org123',
                role: 'admin'
              })
            }
          }
        }
      }

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context({
        ...request,
        auth: {
          isAuthenticated: true,
          credentials: {
            sbi: '106284736',
            name: 'John Doe',
            organisationId: 'org123',
            organisationName: ' Farm 1',
            role: 'admin',
            sessionId: 'valid-session-id'
          }
        }
      })

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
      const request = {
        ...mockRequest,
        server: {
          app: {
            cache: {
              get: vi.fn().mockReturnValue(null)
            }
          }
        }
      }

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context({
        ...request,
        auth: { isAuthenticated: true, credentials: { sessionId: 'valid-session-id' } }
      })

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
      const requestWithAuth = {
        ...mockRequest,
        auth: { isAuthenticated: true, credentials },
        server: {
          app: {
            cache: {
              get: vi.fn().mockImplementation(() => {
                credentials.sessionId = null
                throw new Error('Cache retrieval failed')
              })
            }
          }
        }
      }

      vi.resetModules()
      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(requestWithAuth)

      expect(mockLog).toHaveBeenCalledWith(
        'AUTH_SIGN_IN_FAILURE',
        {
          userId: 'unknown',
          error: expect.stringContaining('Cache retrieval failed for session unknown'),
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

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
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
      expect(contextResult.cookieBannerConfig).toEqual({
        ariaLabel: 'Cookies on Manage land-based actions',
        hidden: true,
        attributes: {
          'data-nosnippet': '',
          id: 'cookie-banner',
          'data-cookie-name': 'cookie_consent',
          'data-expiry-days': 365,
          'data-ga-tracking-id': undefined
        },
        messages: [
          {
            headingText: 'Cookies on Manage land-based actions',
            html: '<p class="govuk-body">We use some essential cookies to make this service work.</p><p class="govuk-body">We\'d like to set additional cookies to understand how you use the service, remember your settings and improve the service.</p>',
            actions: [
              {
                text: 'Accept analytics cookies',
                type: 'button',
                attributes: { id: 'cookie-banner-accept', 'data-module': 'govuk-button' }
              },
              {
                text: 'Reject analytics cookies',
                type: 'button',
                attributes: { id: 'cookie-banner-reject', 'data-module': 'govuk-button' }
              },
              {
                text: 'View cookies',
                href: '/cookies'
              }
            ]
          }
        ]
      })
    })

    test('includes cookieBannerNoscriptConfig with correct structure', async () => {
      setupManifestSuccess()

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.cookieBannerNoscriptConfig).toBeDefined()
      expect(contextResult.cookieBannerNoscriptConfig).toEqual({
        ariaLabel: 'Cookies on Manage land-based actions',
        attributes: { 'data-nosnippet': '' },
        messages: [
          {
            headingText: 'Cookies on Manage land-based actions',
            html: '<p class="govuk-body">We use some essential cookies to make this service work.</p><p class="govuk-body">JavaScript is disabled, so you cannot set cookie preferences. Analytics cookies will not run.</p>'
          }
        ]
      })
    })

    test('includes cookie banner configs in fallback context', async () => {
      setupSbiStoreError()
      mockReadFileSync.mockReturnValue('{}')

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.cookieBannerConfig).toBeDefined()
      expect(contextResult.cookieBannerConfig.ariaLabel).toBe('Cookies on Manage land-based actions')
      expect(contextResult.cookieBannerConfig.attributes['data-cookie-name']).toBe('cookie_consent')

      expect(contextResult.cookieBannerNoscriptConfig).toBeDefined()
      expect(contextResult.cookieBannerNoscriptConfig.ariaLabel).toBe('Cookies on Manage land-based actions')
    })
  })
})
