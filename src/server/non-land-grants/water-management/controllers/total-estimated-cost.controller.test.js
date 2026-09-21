import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import TotalEstimatedCostController from './total-estimated-cost.controller.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
import { mergeAdditionalAnswers } from '~/src/server/common/helpers/state/additional-answers-helper.js'

vi.mock('~/src/server/common/helpers/state/additional-answers-helper.js', () => ({
  mergeAdditionalAnswers: vi.fn((state, answers) => ({ ...state, ...answers }))
}))

describe('TotalEstimatedCostController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    const mockModel = {
      def: {
        metadata: {
          totalEstimatedCostsPage: {
            reservoirCostPerUnit: 2.5,
            distNetworkCostPerUnit: 5,
            tanksCostPerUnit: 1.5
          }
        }
      }
    }
    const mockPageDef = {
      path: '/total-estimated-cost',
      title: 'Total estimated cost'
    }
    controller = new TotalEstimatedCostController(mockModel, mockPageDef)
    setupControllerMocks(controller)

    mockRequest = {
      app: {
        model: mockModel
      }
    }
    mockContext = {
      state: {
        itemsPlanningToInstall: [],
        howMuchWater: 100,
        waterDistributionLength: 50,
        waterStorageCapacity: 200
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
    it('should calculate costs correctly when all items are selected', async () => {
      mockContext.state.itemsPlanningToInstall = ['RESERVOIR', 'WATER_DISTRIBUTION_NETWORK', 'WATER_STORAGE_TANKS']

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mergeAdditionalAnswers).toHaveBeenCalledWith(expect.anything(), {
        reservoirCostPerUnit: 2.5,
        distNetworkCostPerUnit: 5,
        tanksCostPerUnit: 1.5,
        reservoirCost: 250,
        waterDistributionNetworkCost: 250,
        waterTanksCost: 300,
        totalEstimatedCost: 800,
        estimatedMaxGrant: 320
      })
      expect(controller.setState).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(controller.viewName, expect.objectContaining({ baseModel: 'data' }))
    })

    it('should calculate costs correctly when only RESERVOIR item selected', async () => {
      mockContext.state.itemsPlanningToInstall = ['RESERVOIR']

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mergeAdditionalAnswers).toHaveBeenCalledWith(expect.anything(), {
        reservoirCostPerUnit: 2.5,
        distNetworkCostPerUnit: 5,
        tanksCostPerUnit: 1.5,
        reservoirCost: 250,
        waterDistributionNetworkCost: 0,
        waterTanksCost: 0,
        totalEstimatedCost: 250,
        estimatedMaxGrant: 100
      })
      expect(controller.setState).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(controller.viewName, expect.objectContaining({ baseModel: 'data' }))
    })

    it('should calculate costs correctly when network and tank items are selected', async () => {
      mockContext.state.itemsPlanningToInstall = ['WATER_DISTRIBUTION_NETWORK', 'WATER_STORAGE_TANKS']

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mergeAdditionalAnswers).toHaveBeenCalledWith(expect.anything(), {
        reservoirCostPerUnit: 2.5,
        distNetworkCostPerUnit: 5,
        tanksCostPerUnit: 1.5,
        reservoirCost: 0,
        waterDistributionNetworkCost: 250,
        waterTanksCost: 300,
        totalEstimatedCost: 550,
        estimatedMaxGrant: 220
      })
      expect(controller.setState).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(controller.viewName, expect.objectContaining({ baseModel: 'data' }))
    })

    it('should throw GrantApplicationServiceError on failure', async () => {
      vi.spyOn(controller, 'setState').mockRejectedValue(new Error('Test Error'))

      const handler = controller.makeGetRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow('Failed to calculate total estimated cost')
    })

    it('should throw if totalEstimatedCostsPage is missing from metadata', async () => {
      mockRequest.app.model.def.metadata.totalEstimatedCostsPage = undefined

      const handler = controller.makeGetRouteHandler()

      try {
        await handler(mockRequest, mockContext, mockH)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).toBe('Failed to calculate total estimated cost')
        const cause = Array.from(error.causeErrors)[0]
        expect(cause.message).toBe('Missing required configuration: metadata.totalEstimatedCostsPage')
      }
    })

    it('should throw and report all missing cost units', async () => {
      mockRequest.app.model.def.metadata.totalEstimatedCostsPage = {}

      const handler = controller.makeGetRouteHandler()

      try {
        await handler(mockRequest, mockContext, mockH)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).toBe('Failed to calculate total estimated cost')
        const cause = Array.from(error.causeErrors)[0]
        expect(cause.message).toBe(
          'Missing required configuration: metadata.totalEstimatedCostsPage.reservoirCostPerUnit, metadata.totalEstimatedCostsPage.distNetworkCostPerUnit, metadata.totalEstimatedCostsPage.tanksCostPerUnit'
        )
      }
    })

    it('should throw if only reservoirCostPerUnit is missing', async () => {
      mockRequest.app.model.def.metadata.totalEstimatedCostsPage = {
        distNetworkCostPerUnit: 5,
        tanksCostPerUnit: 1.5
      }

      const handler = controller.makeGetRouteHandler()

      try {
        await handler(mockRequest, mockContext, mockH)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).toBe('Failed to calculate total estimated cost')
        const cause = Array.from(error.causeErrors)[0]
        expect(cause.message).toBe(
          'Missing required configuration: metadata.totalEstimatedCostsPage.reservoirCostPerUnit'
        )
      }
    })
  })
})
