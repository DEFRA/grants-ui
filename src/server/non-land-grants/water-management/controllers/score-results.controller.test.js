import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import ScoreResultsController from './score-results.controller.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
import { mergeAdditionalAnswers } from '~/src/server/common/helpers/state/additional-answers-helper.js'

vi.mock('~/src/server/common/helpers/state/additional-answers-helper.js', () => ({
  mergeAdditionalAnswers: vi.fn((state, answers) => ({ ...state, ...answers }))
}))

describe('ScoreResultsController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    const mockModel = {}
    const mockPageDef = {
      path: '/score-results',
      title: 'Score results'
    }
    controller = new ScoreResultsController(mockModel, mockPageDef)
    setupControllerMocks(controller)

    mockRequest = {}
    mockContext = {
      state: {
        cropsGrowing: 'FOOD_INDUSTRY',
        countyProjectLocated: 'CHESHIRE'
      }
    }
    mockH = {
      view: vi.fn().mockReturnValue('mocked-view')
    }

    vi.spyOn(QuestionPageController.prototype, 'getViewModel').mockReturnValue({
      baseModel: 'data'
    })

    vi.spyOn(controller, 'setState').mockImplementation(async (req, state) => state)

    vi.clearAllMocks()
  })

  describe('makeGetRouteHandler', () => {
    it('should set scoreResults to Average and render view', async () => {
      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(mergeAdditionalAnswers).toHaveBeenCalledWith(expect.anything(), {
        scoreResults: 'Average'
      })
      expect(controller.setState).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(controller.viewName, expect.objectContaining({ baseModel: 'data' }))
    })

    it('should throw GrantApplicationServiceError on failure', async () => {
      vi.spyOn(controller, 'setState').mockRejectedValue(new Error('Test Error'))

      const handler = controller.makeGetRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow('Failed to retrieve score results')
    })
  })
})
