import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import ScoreResultsController from './score-results.controller.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
import { mergeAdditionalAnswers } from '~/src/server/common/helpers/state/additional-answers-helper.js'
import { invokeGrantScoringGetAction } from '~/src/server/common/services/grant-scoring/grant-scoring.service.js'

vi.mock('~/src/server/common/helpers/state/additional-answers-helper.js', () => ({
  mergeAdditionalAnswers: vi.fn((state, answers) => ({
    ...state,
    additionalAnswers: { ...state.additionalAnswers, ...answers }
  }))
}))

vi.mock('~/src/server/common/services/grant-scoring/grant-scoring.service.js', () => ({
  invokeGrantScoringGetAction: vi.fn()
}))

describe('ScoreResultsController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    const mockModel = {
      def: {
        metadata: {
          pageConfig: {
            '/score-results': {
              derivedState: {
                stateKeys: ['eligibilityScore', 'eligibilityBand'],
                requiresAcknowledgement: false
              }
            }
          }
        }
      }
    }
    const mockPageDef = {
      path: '/score-results',
      title: 'Score results'
    }
    controller = new ScoreResultsController(mockModel, mockPageDef)
    controller.path = mockPageDef.path
    setupControllerMocks(controller)

    mockRequest = {}
    mockContext = {
      relevantPages: [controller],
      state: {
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
    it('should set scoreResults based on scoring service and render view', async () => {
      invokeGrantScoringGetAction.mockResolvedValueOnce({ score: 75, band: 'High' })
      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(invokeGrantScoringGetAction).toHaveBeenCalledWith('water-management', mockRequest, {
        county: 'CHESHIRE'
      })
      expect(mergeAdditionalAnswers).toHaveBeenCalledWith(expect.anything(), {
        eligibilityScore: 75,
        eligibilityBand: 'High'
      })
      expect(controller.setState).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(controller.viewName, expect.objectContaining({ baseModel: 'data' }))
    })

    it('should throw GrantScoringServiceError on failure', async () => {
      invokeGrantScoringGetAction.mockRejectedValue(new Error('Test Error'))

      const handler = controller.makeGetRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        'Failed to get grant eligibility score result'
      )
    })
  })
})
