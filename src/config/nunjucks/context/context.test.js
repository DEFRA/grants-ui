const mockReadFileSync = jest.fn()
const mockLoggerError = jest.fn()
const mockCacheGet = jest.fn()

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  readFileSync: () => mockReadFileSync()
}))
jest.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: () => ({ error: (...args) => mockLoggerError(...args) })
}))
jest.mock('~/src/server/sbi/state.js', () => ({
  sbiStore: {
    get: jest.fn(() => 106284736)
  }
}))

describe('context', () => {
  const mockRequest = { path: '/' }
  let contextResult

  describe('When webpack manifest file read succeeds', () => {
    let contextImport

    beforeAll(async () => {
      contextImport = await import('~/src/config/nunjucks/context/context.js')
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    beforeEach(async () => {
      // Return JSON string
      mockReadFileSync.mockReturnValue(`{
        "application.js": "javascripts/application.js",
        "stylesheets/application.scss": "stylesheets/application.css"
      }`)

      contextResult = await contextImport.context(mockRequest)
    })

    test('Should provide expected context', () => {
      expect(contextResult).toEqual({
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
        enableSbiSelector: expect.any(Boolean),
        auth: {
          isAuthenticated: false,
          name: undefined,
          role: undefined,
          organisationId: undefined,
          sbi: 106284736
        }
      })
    })

    describe('With valid asset path', () => {
      test('Should provide expected asset path', () => {
        expect(contextResult.getAssetPath('application.js')).toBe('/public/javascripts/application.js')
      })
    })

    describe('With invalid asset path', () => {
      test('Should provide expected asset', () => {
        expect(contextResult.getAssetPath('an-image.png')).toBe('/public/an-image.png')
      })
    })
  })

  describe('When webpack manifest file read fails', () => {
    let contextImport

    beforeAll(async () => {
      contextImport = await import('~/src/config/nunjucks/context/context.js')
    })

    beforeEach(() => {
      mockReadFileSync.mockReturnValue(new Error('File not found'))

      contextResult = contextImport.context(mockRequest)
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    test('Should log that the Webpack Manifest file is not available', () => {
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Webpack assets-manifest.json not found'))
    })
  })

  describe('#context cache', () => {
    const mockRequest = { path: '/' }
    let contextResult

    describe('Webpack manifest file cache', () => {
      let contextImport

      beforeAll(async () => {
        contextImport = await import('~/src/config/nunjucks/context/context.js')
      })

      beforeEach(async () => {
        // Return JSON string
        mockReadFileSync.mockReturnValue(`{
          "application.js": "javascripts/application.js",
          "stylesheets/application.scss": "stylesheets/application.css"
        }`)

        contextResult = await contextImport.context(mockRequest)
      })

      afterEach(() => {
        jest.clearAllMocks()
      })

      test('Should read file', () => {
        expect(mockReadFileSync).toHaveBeenCalled()
      })

      test('Should use cache', () => {
        expect(mockReadFileSync).not.toHaveBeenCalled()
      })

      test('Should provide expected context', () => {
        expect(contextResult).toEqual({
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
          enableSbiSelector: expect.any(Boolean),
          auth: {
            isAuthenticated: false,
            name: undefined,
            organisationId: undefined,
            role: undefined,
            sbi: 106284736
          }
        })
      })
    })

    describe('Error handling', () => {
      let contextImport

      beforeAll(async () => {
        contextImport = await import('~/src/config/nunjucks/context/context.js')
      })

      afterEach(() => {
        jest.clearAllMocks()
      })

      test('Should return minimal context when an error occurs', async () => {
        mockReadFileSync.mockImplementation(() => {
          throw new Error('File read failed')
        })

        const contextResult = await contextImport.context(mockRequest)

        expect(contextResult).toEqual({
          assetPath: '/public/assets/rebrand',
          breadcrumbs: [],
          getAssetPath: expect.any(Function),
          navigation: expect.any(Array),
          serviceName: 'Manage land-based actions',
          serviceUrl: '/',
          enableSbiSelector: expect.any(Boolean),
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
    })

    describe('Webpack manifest read fails', () => {
      let contextImport

      beforeAll(async () => {
        contextImport = await import('~/src/config/nunjucks/context/context.js')
      })

      afterEach(() => {
        jest.clearAllMocks()
      })

      test('Should log an error and continue', async () => {
        mockReadFileSync.mockImplementation(() => {
          throw new Error('Manifest not found')
        })

        const contextResult = await contextImport.context(mockRequest)

        expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Webpack assets-manifest.json not found'))

        // Ensure it uses asset path fallback
        expect(contextResult.getAssetPath('test.js')).toBe('/public/test.js')
      })
    })

    describe('Session lookup fails', () => {
      let contextImport

      beforeAll(async () => {
        contextImport = await import('~/src/config/nunjucks/context/context.js')
      })

      afterEach(() => {
        jest.clearAllMocks()
      })

      test('Should log cache retrieval error and fallback to empty session', async () => {
        mockCacheGet.mockImplementation(() => {
          throw new Error('Cache retrieval failed')
        })

        const contextResult = await contextImport.context({
          ...mockRequest,
          auth: { isAuthenticated: true, credentials: { sessionId: 'test-session' } }
        })

        expect(mockLoggerError).toHaveBeenCalledWith(
          expect.stringContaining('Cache retrieval failed for session test-session')
        )

        expect(contextResult.auth).toEqual({
          isAuthenticated: true,
          sbi: 106284736, // SBI fallback from sbiStore
          name: undefined,
          organisationId: undefined,
          role: undefined
        })
      })
    })

    describe('Auth and session', () => {
      let contextImport

      beforeAll(async () => {
        contextImport = await import('~/src/config/nunjucks/context/context.js')
      })

      afterEach(() => {
        jest.clearAllMocks()
      })

      test('Should provide correct auth properties when authenticated', async () => {
        const request = {
          ...mockRequest,
          server: {
            app: {
              cache: {
                get: jest.fn()
              }
            }
          }
        }

        request.server.app.cache.get.mockReturnValue({
          sbi: '123456789',
          name: 'John Doe',
          organisationId: 'org123',
          role: 'admin'
        })

        const contextResult = await contextImport.context({
          ...request,
          auth: { isAuthenticated: true, credentials: { sessionId: 'valid-session-id' } }
        })

        expect(contextResult.auth).toEqual({
          isAuthenticated: true,
          sbi: '123456789',
          name: 'John Doe',
          organisationId: 'org123',
          role: 'admin'
        })
      })
    })

    describe('getAssetPath', () => {
      let contextImport

      beforeAll(async () => {
        contextImport = await import('~/src/config/nunjucks/context/context.js')
      })

      afterEach(() => {
        jest.clearAllMocks()
      })

      test('Resolves asset paths from manifest', async () => {
        mockReadFileSync.mockReturnValue(
          JSON.stringify({
            'application.js': 'javascripts/application.js',
            'stylesheets/application.scss': 'stylesheets/application.css'
          })
        )

        const contextResult = await contextImport.context(mockRequest)

        expect(contextResult.getAssetPath('application.js')).toBe('/public/javascripts/application.js')
        expect(contextResult.getAssetPath('stylesheets/application.scss')).toBe('/public/stylesheets/application.css')
      })

      test('Falls back to default asset path for missing manifest entry', async () => {
        mockReadFileSync.mockReturnValue(
          JSON.stringify({
            'application.js': 'javascripts/application.js'
          })
        )

        const contextResult = await contextImport.context(mockRequest)

        expect(contextResult.getAssetPath('missing-asset.png')).toBe('/public/missing-asset.png')
      })
    })
  })
})
