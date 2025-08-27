const mockReadFileSync = jest.fn()
const mockLoggerError = jest.fn()

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  readFileSync: () => mockReadFileSync()
}))
jest.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: () => ({ error: (...args) => mockLoggerError(...args) })
}))
const mockSbiStoreGet = jest.fn(() => 106284736)
jest.mock('~/src/server/sbi/state.js', () => ({
  sbiStore: {
    get: mockSbiStoreGet
  }
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
  auth: {
    isAuthenticated: false,
    name: undefined,
    role: undefined,
    organisationId: undefined,
    sbi: 106284736
  }
})

const getMinimalFallbackContext = () => ({
  assetPath: '/public/assets/rebrand',
  serviceName: 'Manage land-based actions',
  serviceUrl: '/',
  defraIdEnabled: expect.any(Boolean),
  auth: {
    isAuthenticated: false,
    sbi: null,
    name: null,
    organisationId: null,
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
  const mockRequest = { path: '/', auth: { credentials: { sbi: 106284736 } } }

  afterEach(() => {
    jest.clearAllMocks()
    mockSbiStoreGet.mockReturnValue(106284736)
  })

  describe('Webpack manifest file handling', () => {
    test('Should provide expected context when manifest read succeeds', async () => {
      setupManifestSuccess()

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult).toEqual(getExpectedContext())
    })

    test('Should log error when webpack manifest file read fails', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found')
      })

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      await contextImport.context(mockRequest)

      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Webpack assets-manifest.json not found'))
    })

    test('Should cache webpack manifest file', async () => {
      setupManifestSuccess()

      const contextImport = await import('~/src/config/nunjucks/context/context.js')

      await contextImport.context(mockRequest)
      expect(mockReadFileSync).toHaveBeenCalled()

      await contextImport.context(mockRequest)
      expect(mockReadFileSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('Asset path resolution', () => {
    test('Should provide expected asset path for valid manifest entry', async () => {
      setupManifestSuccess()

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath('application.js')).toBe('/public/javascripts/application.js')
    })

    test('Should provide fallback asset path for invalid manifest entry', async () => {
      setupManifestSuccess()

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath('an-image.png')).toBe('/public/an-image.png')
    })

    test('Should resolve asset paths from manifest correctly', async () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          'application.js': 'javascripts/application.js',
          'stylesheets/application.scss': 'stylesheets/application.css'
        })
      )

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath('application.js')).toBe('/public/javascripts/application.js')
      expect(contextResult.getAssetPath('stylesheets/application.scss')).toBe('/public/stylesheets/application.css')
    })

    test('Should fall back to default asset path for missing manifest entry', async () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          'application.js': 'javascripts/application.js'
        })
      )

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath('missing-asset.png')).toBe('/public/missing-asset.png')
    })
  })

  describe('Error handling scenarios', () => {
    test('Should return minimal context when manifest read error occurs', async () => {
      setupManifestError('File read failed')

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
        auth: {
          isAuthenticated: false,
          name: undefined,
          organisationId: undefined,
          role: undefined,
          sbi: 106284736
        }
      })

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Server error occurred: Webpack assets-manifest.json not found: File read failed')
      )
    })

    test('Should log error and continue when manifest read fails', async () => {
      setupManifestError('Manifest not found')

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Webpack assets-manifest.json not found'))
      expect(contextResult.getAssetPath('test.js')).toBe('/public/test.js')
    })

    test('Should return minimal context and log error when main function throws', async () => {
      setupSbiStoreError()
      mockReadFileSync.mockReturnValue('{}')

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Error building context: SBI store access failed')
      )
      expect(contextResult).toEqual(getMinimalFallbackContext())
    })

    test('Should provide working fallback getAssetPath function', async () => {
      setupSbiStoreError()
      mockReadFileSync.mockReturnValue('{}')

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(mockRequest)

      expect(contextResult.getAssetPath('test-asset.js')).toBe('/public/test-asset.js')
      expect(contextResult.getAssetPath('images/logo.png')).toBe('/public/images/logo.png')
    })
  })

  describe('Session and authentication handling', () => {
    test('Should log cache retrieval error and fallback to empty session', async () => {
      const requestWithAuth = {
        ...mockRequest,
        auth: { isAuthenticated: true, credentials: { sessionId: 'test-session' } },
        server: {
          app: {
            cache: {
              get: jest.fn().mockImplementation(() => {
                throw new Error('Cache retrieval failed')
              })
            }
          }
        }
      }

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(requestWithAuth)

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Cache retrieval failed for session test-session')
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
        server: {
          app: {
            cache: {
              get: jest.fn().mockReturnValue({
                sbi: '106284736',
                name: 'John Doe',
                organisationId: 'org123',
                role: 'admin'
              })
            }
          }
        }
      }

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context({
        ...request,
        auth: { isAuthenticated: true, credentials: { sessionId: 'valid-session-id' } }
      })

      expect(contextResult.auth).toEqual({
        isAuthenticated: true,
        sbi: 106284736,
        name: 'John Doe',
        organisationId: 'org123',
        role: 'admin'
      })
    })

    test('Should handle cache returning null and use empty session', async () => {
      const request = {
        ...mockRequest,
        server: {
          app: {
            cache: {
              get: jest.fn().mockReturnValue(null)
            }
          }
        }
      }

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
              get: jest.fn().mockImplementation(() => {
                credentials.sessionId = null
                throw new Error('Cache retrieval failed')
              })
            }
          }
        }
      }

      const contextImport = await import('~/src/config/nunjucks/context/context.js')
      const contextResult = await contextImport.context(requestWithAuth)

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Cache retrieval failed for session unknown')
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
})
