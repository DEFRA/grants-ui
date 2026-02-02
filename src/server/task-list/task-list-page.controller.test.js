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
  getCompletionStats: vi.fn(),
  splitComponents: vi.fn().mockReturnValue([[], []])
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
      helper.splitComponents.mockReturnValue([['above'], ['below']])

      const result = controller.getViewModel(mockRequest, mockContext)

      expect(helper.buildTaskListData).toHaveBeenCalledWith(expect.anything(), mockRequest.app.model, mockContext.state)
      expect(helper.getCompletionStats).toHaveBeenCalledWith(expect.anything(), mockContext.state)
      expect(helper.splitComponents).toHaveBeenCalled()

      expect(result).toMatchObject({
        taskListSections: [{ title: 'Section 1', items: [] }],
        completionStats: { completed: 1, total: 2, isComplete: false },
        someConfig: 'value',
        isComplete: false,
        aboveComponents: ['above'],
        belowComponents: ['below']
      })
    })

    it('should use empty state if context.state is missing', () => {
      const mockRequest = {
        app: { model: {} }
      }
      const mockContext = {} // No state

      controller.getViewModel(mockRequest, mockContext)

      expect(helper.buildTaskListData).toHaveBeenCalledWith(expect.anything(), mockRequest.app.model, {})
    })
  })
})
