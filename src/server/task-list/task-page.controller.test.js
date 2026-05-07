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

      proceed(request, h, nextPath) {
        return `proceeded:${nextPath}`
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

    it('should resolve section by id for V2 forms', () => {
      const section = { id: 'section-uuid', name: 'my-section', title: 'My Section' }
      const model = {
        def: { metadata: { tasklist: {} } },
        sections: [section],
        getSection: () => section
      }
      const pageDef = { section: 'section-uuid' }

      const ctrl = new TaskPageController(model, pageDef)
      expect(ctrl.section).toBe(section)
    })
  })

  describe('getViewModel', () => {
    it('should add back link and backToTaskList if configured', () => {
      helper.getTaskPageBackLink.mockReturnValue({ href: '/back', text: 'Back' })
      const mockRequest = { query: {} }
      const mockContext = {}

      const result = controller.getViewModel(mockRequest, mockContext)

      expect(result.backLink).toEqual({ href: '/back', text: 'Back' })
      // returnAfterSection defaults to true, so backToTaskList shouldn't be there
      expect(result.backToTaskList).toBeUndefined()
    })

    it('should add backToTaskList if returnAfterSection is false', () => {
      const mockRequest = { query: {} }
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
      const mockRequest = { payload: { action: 'submit' }, query: {} }
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

      controller.proceed = vi.fn().mockReturnValue('proceeded')

      const result = await handler(mockRequest, mockContext, mockH)
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('proceeded')
    })
  })

  describe('proceed', () => {
    it('should return default next path when next page is in the same section', () => {
      const section = { name: 's1', id: 'section-1' }
      mockPageDef.section = 's1'
      mockModel.def.metadata.tasklist.returnAfterSection = true
      mockModel.pages = [{ path: '/next-path', section }]
      controller.section = section

      const result = controller.proceed({}, {}, '/next-path')
      expect(result).toBe('proceeded:/next-path')
    })

    it('should return default next path when next page has no section (e.g. exit page)', () => {
      const section = { name: 's1', id: 'section-1' }
      mockPageDef.section = 's1'
      mockModel.def.metadata.tasklist.returnAfterSection = true
      mockModel.pages = [{ path: '/next-path', section: undefined }]
      controller.section = section

      const result = controller.proceed({}, {}, '/next-path')
      expect(result).toBe('proceeded:/next-path')
    })

    it('should redirect to task list when next page is in a different section', () => {
      const section = { name: 's1', id: 'section-1' }
      const otherSection = { name: 's2', id: 'section-2' }
      mockPageDef.section = 's1'
      mockModel.def.metadata.tasklist.returnAfterSection = true
      mockModel.pages = [{ path: '/next-path', section: otherSection }]
      controller.section = section

      const result = controller.proceed({}, {}, '/next-path')
      expect(result).toBe('proceeded:/task-list')
    })

    it('should redirect to task list when there is no next page', () => {
      const section = { name: 's1', id: 'section-1' }
      mockPageDef.section = 's1'
      mockModel.def.metadata.tasklist.returnAfterSection = true
      mockModel.pages = []
      controller.section = section

      const result = controller.proceed({}, {}, undefined)
      expect(result).toBe('proceeded:/task-list')
    })

    it('should fall back to default navigation if not a task page (no section)', () => {
      // pageDef has no section
      mockModel.pages = [{ path: '/next-path' }]

      const result = controller.proceed({}, {}, '/next-path')
      expect(result).toBe('proceeded:/next-path')
    })
  })
})
