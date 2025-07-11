import SectionEndController from './section-end.controller.js'
import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { existsSync } from 'fs'
import { join } from 'path'

describe('SectionEndController', () => {
  let controller
  let mockModel
  let mockPageDef

  beforeEach(() => {
    mockModel = {
      basePath: '/test-form'
    }
    mockPageDef = {
      path: '/summary',
      title: 'Summary'
    }
    controller = new SectionEndController(mockModel, mockPageDef)
  })

  describe('constructor', () => {
    it('should extend SummaryPageController', () => {
      expect(controller).toBeInstanceOf(SummaryPageController)
    })

    it('should set viewName to section-end-summary', () => {
      expect(controller.viewName).toBe(
        'section-end/views/section-end-summary.html'
      )
    })
  })

  describe('getSummaryViewModel', () => {
    let mockRequest
    let mockContext
    let originalParentMethod
    let parentGetSummaryViewModel

    beforeEach(() => {
      mockRequest = {}
      mockContext = {}

      originalParentMethod = Object.getPrototypeOf(
        Object.getPrototypeOf(controller)
      ).getSummaryViewModel

      parentGetSummaryViewModel = jest.fn()
      Object.getPrototypeOf(
        Object.getPrototypeOf(controller)
      ).getSummaryViewModel = parentGetSummaryViewModel
    })

    afterEach(() => {
      if (originalParentMethod) {
        Object.getPrototypeOf(
          Object.getPrototypeOf(controller)
        ).getSummaryViewModel = originalParentMethod
      }
    })

    it('should call parent method and transform checkAnswers array to first element', () => {
      const mockViewModel = {
        checkAnswers: [
          { title: 'Section 1', questions: [] },
          { title: 'Section 2', questions: [] }
        ],
        otherProperty: 'value'
      }
      parentGetSummaryViewModel.mockReturnValue(mockViewModel)

      const result = controller.getSummaryViewModel(mockRequest, mockContext)

      expect(parentGetSummaryViewModel).toHaveBeenCalledWith(
        mockRequest,
        mockContext
      )
      expect(result.checkAnswers).toEqual({ title: 'Section 1', questions: [] })
      expect(result.otherProperty).toBe('value')
    })

    it('should handle empty array and non-array values', () => {
      const emptyArrayViewModel = { checkAnswers: [] }
      parentGetSummaryViewModel.mockReturnValue(emptyArrayViewModel)

      let result = controller.getSummaryViewModel(mockRequest, mockContext)
      expect(result.checkAnswers).toEqual([])

      const undefinedViewModel = { checkAnswers: undefined }
      parentGetSummaryViewModel.mockReturnValue(undefinedViewModel)

      result = controller.getSummaryViewModel(mockRequest, mockContext)
      expect(result.checkAnswers).toBeUndefined()
    })
  })

  describe('makePostRouteHandler', () => {
    let handler
    let mockRequest
    let mockContext
    let mockH

    beforeEach(() => {
      mockRequest = {
        app: {
          model: {
            basePath: '/test-form'
          }
        },
        server: {
          app: {
            cacheTemp: {
              get: jest.fn(),
              set: jest.fn()
            }
          }
        },
        yar: {
          id: 'session-123',
          get: jest.fn()
        },
        query: {},
        url: {
          href: 'http://test.com/test-form/summary'
        }
      }

      mockContext = {
        relevantState: {
          field1: 'value1',
          field2: 'value2'
        }
      }

      mockH = {
        redirect: jest.fn()
      }

      handler = controller.makePostRouteHandler()
    })

    it('should return a function', () => {
      expect(typeof handler).toBe('function')
    })

    it('should get existing data from cache', async () => {
      const existingData = { 'other-form': { existingField: 'existingValue' } }
      mockRequest.server.app.cacheTemp.get.mockResolvedValue(existingData)

      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.server.app.cacheTemp.get).toHaveBeenCalledWith(
        'session-123'
      )
    })

    it('should handle null data from cache', async () => {
      mockRequest.server.app.cacheTemp.get.mockResolvedValue(null)

      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.server.app.cacheTemp.set).toHaveBeenCalledWith(
        'session-123',
        {
          '/test-form': {
            field1: 'value1',
            field2: 'value2'
          }
        }
      )
    })

    it('should merge new data with existing data', async () => {
      const existingData = {
        'other-form': { existingField: 'existingValue' },
        '/test-form': { oldField: 'oldValue' }
      }
      mockRequest.server.app.cacheTemp.get.mockResolvedValue(existingData)

      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.server.app.cacheTemp.set).toHaveBeenCalledWith(
        'session-123',
        {
          'other-form': { existingField: 'existingValue' },
          '/test-form': {
            field1: 'value1',
            field2: 'value2'
          }
        }
      )
    })

    it('should save merged data to cache', async () => {
      mockRequest.server.app.cacheTemp.get.mockResolvedValue({})

      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.server.app.cacheTemp.set).toHaveBeenCalledWith(
        'session-123',
        {
          '/test-form': {
            field1: 'value1',
            field2: 'value2'
          }
        }
      )
    })

    it('should redirect based on source query parameter', async () => {
      mockRequest.server.app.cacheTemp.get.mockResolvedValue({})
      mockRequest.query = { source: 'custom-tasklist' }

      await handler(mockRequest, mockContext, mockH)

      expect(mockH.redirect).toHaveBeenCalledWith('/custom-tasklist/tasklist')
    })

    it('should get source from session when not in query', async () => {
      mockRequest.server.app.cacheTemp.get.mockResolvedValue({})
      mockRequest.query = {}
      mockRequest.yar.get.mockReturnValue({
        fromTasklist: true,
        tasklistId: 'session-tasklist'
      })

      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.yar.get).toHaveBeenCalledWith('tasklistContext')
      expect(mockH.redirect).toHaveBeenCalledWith('/session-tasklist/tasklist')
    })

    it('should handle async operations correctly', async () => {
      mockRequest.server.app.cacheTemp.get.mockResolvedValue({})
      mockRequest.server.app.cacheTemp.set.mockResolvedValue(undefined)

      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.server.app.cacheTemp.get).toHaveBeenCalled()
      expect(mockRequest.server.app.cacheTemp.set).toHaveBeenCalled()
      expect(mockH.redirect).toHaveBeenCalled()
    })

    it('should use Object.assign to merge data', async () => {
      const existingData = { '/test-form': { existingField: 'value' } }
      mockRequest.server.app.cacheTemp.get.mockResolvedValue(existingData)

      const objectAssignSpy = jest.spyOn(Object, 'assign')

      await handler(mockRequest, mockContext, mockH)

      expect(objectAssignSpy).toHaveBeenCalledWith(existingData, {
        '/test-form': mockContext.relevantState
      })

      objectAssignSpy.mockRestore()
    })
  })

  describe('integration with SummaryPageController', () => {
    it('should properly set up the controller instance', () => {
      expect(controller).toBeDefined()
      expect(controller.viewName).toBe(
        'section-end/views/section-end-summary.html'
      )
      expect(controller).toHaveProperty('makePostRouteHandler')
    })

    it('should override makePostRouteHandler from parent', () => {
      const handler = controller.makePostRouteHandler()
      expect(typeof handler).toBe('function')
      expect(handler.constructor.name).toBe('AsyncFunction')
    })
  })

  describe('view file existence', () => {
    it('should reference a view file that actually exists', () => {
      const viewPath = controller.viewName
      expect(viewPath).toBe('section-end/views/section-end-summary.html')

      // Check that the view file exists at the expected location
      const absoluteViewPath = join(process.cwd(), 'src/server', viewPath)
      expect(existsSync(absoluteViewPath)).toBe(true)
    })

    it('should not reference the old view location', () => {
      const oldViewPath = join(
        process.cwd(),
        'src/server/views/section-end-summary.html'
      )
      expect(existsSync(oldViewPath)).toBe(false)
    })

    it('should have view file in the feature-based location', () => {
      const featureViewPath = join(
        process.cwd(),
        'src/server/section-end/views/section-end-summary.html'
      )
      expect(existsSync(featureViewPath)).toBe(true)
    })
  })
})
