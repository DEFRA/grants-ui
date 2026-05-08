import { beforeEach, describe, expect, it, vi } from 'vitest'
import TaskListPageController from './task-list-page.controller.js'
import * as helper from './task-list.helper.js'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => {
  return {
    QuestionPageController: class {
      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
      }

      getViewModel(request, context) {
        return {
          page: {
            def: this.pageDef,
            collection: { components: [] }
          }
        }
      }
    }
  }
})

vi.mock('./task-list.helper.js', () => ({
  buildTaskListData: vi.fn(),
  getCompletionStats: vi.fn()
}))

describe('TaskListPageController', () => {
  let controller
  let mockModel
  let mockPageDef

  beforeEach(() => {
    vi.clearAllMocks()
    mockModel = {}
    mockPageDef = {
      metadata: {
        tasklist: { someConfig: 'value' }
      }
    }
    controller = new TaskListPageController(mockModel, mockPageDef)
  })

  describe('constructor', () => {
    it('should set the correct viewName', () => {
      expect(controller.viewName).toBe('task-list-page.html')
    })

    it('should call super constructor', () => {
      expect(controller.model).toBe(mockModel)
      expect(controller.pageDef).toBe(mockPageDef)
    })
  })

  describe('getViewModel', () => {
    it('should build the view model correctly', () => {
      const mockRequest = {
        app: {
          model: { def: { metadata: {} } }
        }
      }
      const mockContext = { state: { some: 'state' } }

      helper.buildTaskListData.mockReturnValue([{ title: 'Section 1', items: [] }])
      helper.getCompletionStats.mockReturnValue({ completed: 1, total: 2, isComplete: false })
      const result = controller.getViewModel(mockRequest, mockContext)

      expect(helper.buildTaskListData).toHaveBeenCalledWith(expect.anything(), mockRequest.app.model, mockContext.state)
      expect(helper.getCompletionStats).toHaveBeenCalledWith(
        expect.anything(),
        mockRequest.app.model,
        mockContext.state
      )

      expect(result).toMatchObject({
        tasks: [{ title: 'Section 1', items: [] }],
        completionStats: { completed: 1, total: 2, isComplete: false },
        someConfig: 'value',
        isComplete: false,
        aboveComponents: [],
        belowComponents: []
      })
    })

    it('should split components into aboveComponents and belowComponents', () => {
      const mockRequest = {
        app: {
          model: { def: { metadata: {} } }
        }
      }
      const mockContext = { state: {} }

      helper.buildTaskListData.mockReturnValue([])
      helper.getCompletionStats.mockReturnValue({ completed: 0, total: 0, isComplete: true })

      // Override the super getViewModel to return components with positions
      controller.pageDef = {
        metadata: { tasklist: {} }
      }
      vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(controller)), 'getViewModel').mockReturnValue({
        page: {
          def: controller.pageDef,
          collection: {
            components: [
              { type: 'Html', content: 'above', options: { position: 'above' }, isFormComponent: false, title: 'A' },
              { type: 'Html', content: 'below', options: { position: 'below' }, isFormComponent: false, title: 'B' }
            ]
          }
        }
      })

      const result = controller.getViewModel(mockRequest, mockContext)
      expect(result.aboveComponents).toHaveLength(1)
      expect(result.aboveComponents[0].model.content).toBe('above')
      expect(result.belowComponents).toHaveLength(1)
      expect(result.belowComponents[0].model.content).toBe('below')
    })

    it('should use empty state if context.state is missing', () => {
      const mockRequest = {
        app: {
          model: {
            sections: [{ title: 'Section 1' }]
          }
        }
      }
      const mockContext = {} // No state

      helper.buildTaskListData.mockReturnValue([{ title: 'Section 1', items: [] }])
      helper.getCompletionStats.mockReturnValue({ completed: 1, total: 2, isComplete: false })

      controller.getViewModel(mockRequest, mockContext)

      expect(helper.buildTaskListData).toHaveBeenCalledWith(expect.anything(), mockRequest.app.model, {})
    })
  })
})
