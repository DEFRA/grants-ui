import { beforeEach, describe, expect, it, vi } from 'vitest'
import TaskPageController from './task-page.controller.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import * as helper from './task-list.helper.js'
import { FormAction } from '@defra/forms-engine-plugin/types'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => {
  return {
    QuestionPageController: class {
      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
        this.collection = {
          getViewErrors: vi.fn((errors) => errors)
        }
      }

      getViewModel(request, context) {
        return {
          serviceUrl: '/service',
          page: {
            model: this.model,
            def: {
              ...this.pageDef,
              metadata: { tasklist: {} }
            }
          }
        }
      }

      makePostRouteHandler() {
        return vi.fn().mockResolvedValue('parent post response')
      }

      setState() {
        return Promise.resolve()
      }

      proceed() {
        return 'proceeded'
      }

      getNextPath() {
        return '/next-path'
      }

      filterConditionalComponents() {
        return []
      }
    }
  }
})

vi.mock('./task-list.helper.js', () => ({
  getNextTaskPath: vi.fn(),
  getTaskListPath: vi.fn().mockReturnValue('/task-list'),
  getTaskPageBackLink: vi.fn()
}))

describe('TaskPageController', () => {
  let controller
  let mockModel
  let mockPageDef

  beforeEach(() => {
    vi.clearAllMocks()
    mockModel = {
      def: { metadata: { tasklist: {} } }
    }
    mockPageDef = { view: 'custom-view' }
    controller = new TaskPageController(mockModel, mockPageDef)
  })

  describe('constructor', () => {
    it('should override viewName if provided in pageDef', () => {
      expect(controller.viewName).toBe('custom-view')
    })
  })

  describe('getViewModel', () => {
    it('should add back link and backToTaskList if configured', () => {
      helper.getTaskPageBackLink.mockReturnValue({ href: '/back', text: 'Back' })
      const mockRequest = {}
      const mockContext = {}

      const result = controller.getViewModel(mockRequest, mockContext)

      expect(result.backLink).toEqual({ href: '/back', text: 'Back' })
      // returnAfterSection defaults to true, so backToTaskList shouldn't be there
      expect(result.backToTaskList).toBeUndefined()
    })

    it('should add backToTaskList if returnAfterSection is false', () => {
      const mockRequest = {}
      const mockContext = {}

      // Mocking returnAfterSection = false in the viewModel
      vi.spyOn(QuestionPageController.prototype, 'getViewModel').mockReturnValue({
        serviceUrl: '/service',
        page: {
          model: mockModel,
          def: {
            metadata: {
              tasklist: { returnAfterSection: false }
            }
          }
        }
      })

      const result = controller.getViewModel(mockRequest, mockContext)
      expect(result.backToTaskList).toEqual({
        href: '/service/task-list',
        text: 'Back to task list'
      })
    })
  })

  describe('makePostRouteHandler', () => {
    it('should handle External action using parent handler', async () => {
      const handler = controller.makePostRouteHandler()
      const mockRequest = { payload: { action: FormAction.External + ':something' } }
      const mockContext = {}
      const mockH = {}

      const result = await handler(mockRequest, mockContext, mockH)
      expect(result).toBe('parent post response')
    })

    it('should handle validation errors', async () => {
      const handler = controller.makePostRouteHandler()
      const mockRequest = { payload: { action: 'submit' } }
      const mockContext = { errors: { some: 'error' }, evaluationState: {} }
      const mockH = {
        view: vi.fn().mockReturnValue('error view')
      }

      const result = await handler(mockRequest, mockContext, mockH)
      expect(mockH.view).toHaveBeenCalled()
      expect(result).toBe('error view')
    })

    it('should handle SaveAndExit action', async () => {
      controller.handleSaveAndExit = vi.fn().mockResolvedValue('saved and exited')
      const handler = controller.makePostRouteHandler()
      const mockRequest = { payload: { action: FormAction.SaveAndExit } }
      const mockContext = { state: {} }
      const mockH = {}

      const result = await handler(mockRequest, mockContext, mockH)
      expect(controller.handleSaveAndExit).toHaveBeenCalled()
      expect(result).toBe('saved and exited')
    })

    it('should proceed to next path on success', async () => {
      const handler = controller.makePostRouteHandler()
      const mockRequest = { payload: { action: 'submit' } }
      const mockContext = { state: {} }
      const mockH = {}

      controller.getNextOrTaskPath = vi.fn().mockReturnValue('/next')
      controller.proceed = vi.fn().mockReturnValue('proceeded')

      const result = await handler(mockRequest, mockContext, mockH)
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next')
      expect(result).toBe('proceeded')
    })
  })

  describe('getNextOrTaskPath', () => {
    it('should return getNextTaskPath if it is a task page and returnAfterSection is true', () => {
      mockPageDef.section = 's1'
      mockModel.def.metadata.tasklist.returnAfterSection = true
      helper.getNextTaskPath.mockReturnValue('/task-next')

      const result = controller.getNextOrTaskPath({})
      expect(result).toBe('/task-next')
    })

    it('should fall back to default navigation if not a task page', () => {
      const result = controller.getNextOrTaskPath({})
      expect(result).toBe('/next-path')
    })
  })
})
