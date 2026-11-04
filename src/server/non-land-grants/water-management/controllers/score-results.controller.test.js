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

    vi.spyOn(QuestionPageController.prototype, 'getViewModel').mockReturnValue({
      baseModel: 'data'
    })

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

    vi.spyOn(controller, 'setState').mockImplementation(async (req, state) => state)

    vi.clearAllMocks()
  })

  describe('makeGetRouteHandler', () => {
    it('should refresh state and render view', async () => {
      invokeGrantScoringGetAction.mockResolvedValueOnce({
        totalScore: 75,
        sectorScore: 20,
        scarcityScore: 20,
        collaborationScore: 20,
        planningAbstractionScore: 15
      })

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(invokeGrantScoringGetAction).toHaveBeenCalledWith(
        'scoring/water-management',
        'water-management',
        expect.objectContaining({
          sectorsIrrigated: ['Soft & Cane Fruit'],
          easting: '286394',
          northing: '286394',
          businessesUsingWater: 'FIVE_OR_MORE',
          planning: 'NN',
          abstraction: 'NN'
        })
      )
      expect(mergeAdditionalAnswers).toHaveBeenCalled()
      expect(controller.setState).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(controller.viewName, expect.objectContaining({ baseModel: 'data' }))
      expect(result).toBe('mocked-view')
    })

    it('should throw if refreshing state fails (e.g., scoring service error)', async () => {
      invokeGrantScoringGetAction.mockRejectedValueOnce(new Error('Upstream failure'))
      const handler = controller.makeGetRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow('Failed to refresh derived answers')
    })
  })

  describe('getCalculatedAnswers', () => {
    it('should call invokeGrantScoringGetAction with correct parameters', async () => {
      const scoringResponse = {
        totalScore: 75,
        sectorScore: 20,
        scarcityScore: 20,
        collaborationScore: 20,
        planningAbstractionScore: 15
      }
      invokeGrantScoringGetAction.mockResolvedValueOnce(scoringResponse)

      const state = {
        sectorsIrrigated: ['A'],
        projectLocated__easting: '1',
        projectLocated__northing: '2',
        businessesUsingWater: 'B',
        havePlanningPermission: 'C',
        haveAbstractionLicence: 'D'
      }

      const result = await controller.getCalculatedAnswers(mockRequest, state)

      expect(invokeGrantScoringGetAction).toHaveBeenCalledWith('scoring/water-management', 'water-management', {
        sectorsIrrigated: ['A'],
        easting: '1',
        northing: '2',
        businessesUsingWater: 'B',
        planning: 'C',
        abstraction: 'D'
      })
      expect(result).toEqual(scoringResponse)
    })
  })
})
