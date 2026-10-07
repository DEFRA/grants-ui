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
                stateKeys: [
                  'totalScore',
                  'sectorScore',
                  'scarcityScore',
                  'collaborationScore',
                  'planningAbstractionScore'
                ],
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
        sectorsIrrigated: ['Soft & Cane Fruit'],
        projectLocated__easting: '286394',
        projectLocated__northing: '286394',
        businessesUsingWater: 'FIVE_OR_MORE',
        havePlanningPermission: 'NN',
        haveAbstractionLicence: 'NN'
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
      invokeGrantScoringGetAction.mockResolvedValueOnce({
        totalScore: 75,
        sectorScore: 20,
        scarcityScore: 20,
        collaborationScore: 20,
        planningAbstractionScore: 15
      })
      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(invokeGrantScoringGetAction).toHaveBeenCalledWith('water-management', mockRequest, {
        sectorsIrrigated: ['Soft & Cane Fruit'],
        easting: '286394',
        northing: '286394',
        businessesUsingWater: 'FIVE_OR_MORE',
        planning: 'NN',
        abstraction: 'NN'
      })
      expect(mergeAdditionalAnswers).toHaveBeenCalledWith(expect.anything(), {
        totalScore: 75,
        sectorScore: 20,
        scarcityScore: 20,
        collaborationScore: 20,
        planningAbstractionScore: 15
      })
      expect(controller.setState).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(controller.viewName, expect.objectContaining({ baseModel: 'data' }))
    })

    it('should throw if invokeGrantScoringGetAction fails', async () => {
      invokeGrantScoringGetAction.mockRejectedValueOnce(new Error('Failed to get grant eligibility score result'))
      const handler = controller.makeGetRouteHandler()

      try {
        await handler(mockRequest, mockContext, mockH)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).toBe('Failed to refresh derived answers')
        const [cause] = error.causeErrors
        expect(cause.message).toBe('Failed to get grant eligibility score result')
      }
    })
  })
})
