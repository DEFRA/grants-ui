import { createTasklistRoute } from './tasklist.controller.js'
import { TasklistGenerator } from './services/tasklist-generator.js'
import { loadTasklistConfig, validateTasklistConfig } from './services/config-loader.js'
import {
  createMockHapiRequest,
  createMockHapiResponseToolkit,
  createMockHapiServer,
  createMockTasklistConfig
} from './helpers/test-helpers.js'
import { existsSync } from 'fs'
import { join } from 'path'

jest.mock('./services/tasklist-generator.js')
jest.mock('./services/config-loader.js')

describe('generic-tasklist-controller', () => {
  let mockServer
  let mockRequest
  let mockH
  let mockConfig
  let mockTasklistModel
  let mockGenerateTasklist

  beforeEach(() => {
    jest.clearAllMocks()

    // default auth helper does nothing unless overridden in specific tests
    mockConfig = createMockTasklistConfig()

    mockTasklistModel = {
      pageHeading: 'Test Tasklist',
      sections: []
    }

    mockGenerateTasklist = jest.fn().mockReturnValue(mockTasklistModel)

    mockServer = createMockHapiServer()
    mockRequest = createMockHapiRequest()
    mockH = createMockHapiResponseToolkit()

    loadTasklistConfig.mockResolvedValue(mockConfig)
    validateTasklistConfig.mockReturnValue(true)
    TasklistGenerator.mockImplementation(() => ({
      generateTasklist: mockGenerateTasklist
    }))
  })

  describe('createTasklistRoute', () => {
    it('should create a route plugin with correct name', () => {
      const result = createTasklistRoute('example')

      expect(result).toEqual({
        plugin: {
          name: 'exampleTasklist',
          register: expect.any(Function)
        }
      })
    })

    it('should register GET routes with correct paths', () => {
      const routePlugin = createTasklistRoute('test-tasklist')

      routePlugin.plugin.register(mockServer)

      expect(mockServer.route).toHaveBeenCalledTimes(2)
      expect(mockServer.route).toHaveBeenNthCalledWith(1, {
        method: 'GET',
        path: '/test-tasklist-tasklist',
        handler: expect.any(Function)
      })

      expect(mockServer.route).toHaveBeenNthCalledWith(2, {
        method: 'GET',
        path: '/test-tasklist-tasklist/tasklist',
        handler: expect.any(Function)
      })
    })

    describe('redirect route handler', () => {
      it('should redirect to tasklist page', () => {
        const routePlugin = createTasklistRoute('test-tasklist')
        routePlugin.plugin.register(mockServer)

        const routeCall = mockServer.route.mock.calls[0][0]
        const redirectHandler = routeCall.handler

        const mockRedirect = jest.fn().mockReturnValue({ code: jest.fn() })
        const mockH = { redirect: mockRedirect }

        redirectHandler(mockRequest, mockH)

        expect(mockRedirect).toHaveBeenCalledWith('/test-tasklist-tasklist/tasklist')
        expect(mockRedirect().code).toHaveBeenCalledWith(301)
      })
    })

    describe('route handler', () => {
      let routeHandler

      beforeEach(() => {
        const routePlugin = createTasklistRoute('test-tasklist')
        routePlugin.plugin.register(mockServer)

        const routeCall = mockServer.route.mock.calls[1][0]
        routeHandler = routeCall.handler
      })

      it('should successfully handle request and return view', async () => {
        const result = await routeHandler(mockRequest, mockH)

        expect(loadTasklistConfig).toHaveBeenCalledWith('test-tasklist')
        expect(validateTasklistConfig).toHaveBeenCalledWith(mockConfig)
        expect(mockServer.app.cacheTemp.get).toHaveBeenCalledWith('test-session-id')
        expect(mockRequest.yar.get).toHaveBeenCalledWith('visitedSubSections')
        expect(TasklistGenerator).toHaveBeenCalledWith(mockConfig)
        expect(mockH.view).toHaveBeenCalledWith('tasklist/views/generic-tasklist-page', {
          ...mockTasklistModel,
          tasklistId: 'test-tasklist'
        })
        expect(result).toBe('rendered-view')
      })

      it('should handle empty cache data', async () => {
        mockServer.app.cacheTemp.get.mockResolvedValue(null)

        const result = await routeHandler(mockRequest, mockH)

        expect(mockGenerateTasklist).toHaveBeenCalledWith({}, ['visited1', 'visited2'])
        expect(result).toBe('rendered-view')
      })

      it('should handle empty visited subsections', async () => {
        mockRequest.yar.get.mockReturnValue(null)

        const result = await routeHandler(mockRequest, mockH)

        expect(mockGenerateTasklist).toHaveBeenCalledWith({ testData: 'value' }, [])
        expect(result).toBe('rendered-view')
      })

      it('should log error and rethrow when loadTasklistConfig fails', async () => {
        const configError = new Error('Config load failed')
        loadTasklistConfig.mockRejectedValue(configError)

        await expect(routeHandler(mockRequest, mockH)).rejects.toThrow('Config load failed')

        expect(mockRequest.log).toHaveBeenCalledWith(
          'error',
          'Failed to generate tasklist for test-tasklist: Config load failed'
        )
      })

      it('should log error and rethrow when validateTasklistConfig fails', async () => {
        const validationError = new Error('Invalid config')
        const throwValidationError = () => {
          throw validationError
        }
        validateTasklistConfig.mockImplementation(throwValidationError)

        await expect(routeHandler(mockRequest, mockH)).rejects.toThrow('Invalid config')

        expect(mockRequest.log).toHaveBeenCalledWith(
          'error',
          'Failed to generate tasklist for test-tasklist: Invalid config'
        )
      })

      it('should log warning and continue with empty data when cache get fails', async () => {
        const cacheError = new Error('Cache error')
        mockServer.app.cacheTemp.get.mockRejectedValue(cacheError)

        const result = await routeHandler(mockRequest, mockH)

        expect(mockRequest.logger.warn).toHaveBeenCalledWith(
          {
            error: 'Cache error',
            sessionId: 'test-session-id'
          },
          'Cache retrieval failed, using empty data'
        )
        expect(mockGenerateTasklist).toHaveBeenCalledWith({}, ['visited1', 'visited2'])
        expect(result).toBe('rendered-view')
      })

      it('should log error and rethrow when TasklistGenerator fails', async () => {
        const generatorError = new Error('Generator failed')
        const throwGeneratorError = () => {
          throw generatorError
        }
        mockGenerateTasklist.mockImplementation(throwGeneratorError)

        await expect(routeHandler(mockRequest, mockH)).rejects.toThrow('Generator failed')

        expect(mockRequest.log).toHaveBeenCalledWith(
          'error',
          'Failed to generate tasklist for test-tasklist: Generator failed'
        )
      })

      it('should log error and rethrow when view rendering fails', async () => {
        const viewError = new Error('View error')
        const throwViewError = () => {
          throw viewError
        }
        mockH.view.mockImplementation(throwViewError)

        await expect(routeHandler(mockRequest, mockH)).rejects.toThrow('View error')

        expect(mockRequest.log).toHaveBeenCalledWith(
          'error',
          'Failed to generate tasklist for test-tasklist: View error'
        )
      })
    })

    describe('integration scenarios', () => {
      it('should handle complete workflow with real-like data', async () => {
        const complexConfig = {
          tasklist: {
            id: 'example',
            title: 'Example Grant',
            sections: [
              {
                id: 'section1',
                title: 'Section 1',
                subsections: [{ id: 'sub1', title: 'Subsection 1' }]
              }
            ]
          }
        }

        const complexData = {
          'who-is-applying': { applicantType: 'farmer' },
          'business-details': { name: 'Test Farm' }
        }

        const complexTasklistModel = {
          pageHeading: 'Example Grant',
          sections: [
            {
              title: 'Section 1',
              subsections: [
                {
                  title: { text: 'Subsection 1' },
                  href: '/sub1',
                  status: { tag: { text: 'Completed' } }
                }
              ]
            }
          ]
        }

        loadTasklistConfig.mockResolvedValueOnce(complexConfig)
        mockServer.app.cacheTemp.get.mockResolvedValueOnce(complexData)
        mockRequest.yar.get.mockReturnValueOnce(['sub1'])

        const complexMockGenerateTasklist = jest.fn().mockReturnValue(complexTasklistModel)
        const createComplexTasklistGenerator = () => ({
          generateTasklist: complexMockGenerateTasklist
        })
        TasklistGenerator.mockImplementationOnce(createComplexTasklistGenerator)

        const routePlugin = createTasklistRoute('example')
        routePlugin.plugin.register(mockServer)

        const routeCall = mockServer.route.mock.calls[1][0]
        const handler = routeCall.handler

        const result = await handler(mockRequest, mockH)

        expect(loadTasklistConfig).toHaveBeenCalledWith('example')
        expect(validateTasklistConfig).toHaveBeenCalledWith(complexConfig)
        expect(mockServer.app.cacheTemp.get).toHaveBeenCalledWith('test-session-id')
        expect(mockRequest.yar.get).toHaveBeenCalledWith('visitedSubSections')

        expect(complexMockGenerateTasklist).toHaveBeenCalledWith(complexData, ['sub1'])

        expect(mockH.view).toHaveBeenCalledWith('tasklist/views/generic-tasklist-page', {
          ...complexTasklistModel,
          tasklistId: 'example'
        })
        expect(result).toBe('rendered-view')
      })
    })
  })

  describe('view file existence', () => {
    it('should reference view files that actually exist in the feature directory', () => {
      // Check that the generic tasklist view exists at the expected location
      const genericTasklistViewPath = join(process.cwd(), 'src/server/tasklist/views/generic-tasklist-page.njk')
      expect(existsSync(genericTasklistViewPath)).toBe(true)

      // Check that the score results view exists at the expected location
      const scoreResultsViewPath = join(process.cwd(), 'src/server/tasklist/views/score-results-tasklist.html')
      expect(existsSync(scoreResultsViewPath)).toBe(true)
    })

    it('should not reference the old view locations', () => {
      const oldGenericTasklistPath = join(process.cwd(), 'src/server/views/generic-tasklist-page.njk')
      expect(existsSync(oldGenericTasklistPath)).toBe(false)

      const oldScoreResultsPath = join(process.cwd(), 'src/server/views/score-results-tasklist.html')
      expect(existsSync(oldScoreResultsPath)).toBe(false)
    })

    it('should have tasklist config files in the centralized location', () => {
      const exampleConfigPath = join(
        process.cwd(),
        'src/server/common/forms/definitions/tasklists/example-tasklist.yaml'
      )
      expect(existsSync(exampleConfigPath)).toBe(true)

      const advancedConfigPath = join(
        process.cwd(),
        'src/server/common/forms/definitions/tasklists/advanced-tasklist-features.yaml'
      )
      expect(existsSync(advancedConfigPath)).toBe(true)
    })

    it('should not have config files in the old location', () => {
      const oldConfigDirPath = join(process.cwd(), 'src/server/common/tasklist/configs')
      expect(existsSync(oldConfigDirPath)).toBe(false)
    })
  })

  describe('controller functionality integration', () => {
    it('should create a valid tasklist route plugin', () => {
      const routePlugin = createTasklistRoute('test')
      expect(routePlugin).toBeDefined()
      expect(routePlugin.plugin).toBeDefined()
      expect(routePlugin.plugin.name).toBe('testTasklist')
      expect(typeof routePlugin.plugin.register).toBe('function')
    })
  })
})
