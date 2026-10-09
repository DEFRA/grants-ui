import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import TotalEstimatedCostController from './total-estimated-cost.controller.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
import { mergeAdditionalAnswers } from '~/src/server/common/helpers/state/additional-answers-helper.js'

vi.mock('~/src/server/common/helpers/state/additional-answers-helper.js', () => ({
  mergeAdditionalAnswers: vi.fn((state, answers) => ({
    ...state,
    additionalAnswers: { ...state.additionalAnswers, ...answers }
  }))
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
          pageConfig: {
            '/total-estimated-cost': {
              excludeFromTaskCompletion: true,
              derivedState: {
                stateKeys: [
                  'reservoirHighCostPerUnit',
                  'reservoirLowCostPerUnit',
                  'distNetworkCostPerUnit',
                  'tanksCostPerUnit',
                  'reservoirCost',
                  'waterDistributionNetworkCost',
                  'waterTanksCost',
                  'totalEstimatedCost',
                  'estimatedMaxGrantBeforeReduction',
                  'estimatedMaxGrant',
                  'minGrantReached',
                  'maxGrantReached'
                ],
                requiresAcknowledgement: true
              },
              costs: {
                reservoirClayHighCostPerUnit: 2.5,
                reservoirClayLowCostPerUnit: 2.0,
                reservoirSyntheticHighCostPerUnit: 3.5,
                reservoirSyntheticLowCostPerUnit: 3.0,
                distNetworkCostPerUnit: 5,
                tanksCostPerUnit: 1.5,
                grantMaxRate: 0.4
              }
            }
          }
        }
      }
    }
    const mockPageDef = {
      path: '/total-estimated-cost',
      title: 'Total estimated cost'
    }
    controller = new TotalEstimatedCostController(mockModel, mockPageDef)
    controller.path = mockPageDef.path
    setupControllerMocks(controller)

    mockRequest = {
      app: {
        model: mockModel
      }
    }
    mockContext = {
      relevantPages: [controller],
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
        reservoirHighCostPerUnit: 2.5,
        reservoirLowCostPerUnit: 2.0,
        distNetworkCostPerUnit: 5,
        tanksCostPerUnit: 1.5,
        reservoirCost: 250,
        waterDistributionNetworkCost: 250,
        waterTanksCost: 300,
        totalEstimatedCost: 800,
        estimatedMaxGrantBeforeReduction: 320,
        estimatedMaxGrant: 320,
        minGrantReached: false,
        maxGrantReached: false
      })
      expect(controller.setState).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(controller.viewName, expect.objectContaining({ baseModel: 'data' }))
    })

    it('should calculate costs correctly when only RESERVOIR item selected', async () => {
      mockContext.state.itemsPlanningToInstall = ['RESERVOIR']

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mergeAdditionalAnswers).toHaveBeenCalledWith(expect.anything(), {
        reservoirHighCostPerUnit: 2.5,
        reservoirLowCostPerUnit: 2.0,
        distNetworkCostPerUnit: 5,
        tanksCostPerUnit: 1.5,
        reservoirCost: 250,
        waterDistributionNetworkCost: 0,
        waterTanksCost: 0,
        totalEstimatedCost: 250,
        estimatedMaxGrantBeforeReduction: 100,
        estimatedMaxGrant: 100,
        minGrantReached: false,
        maxGrantReached: false
      })
      expect(controller.setState).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(controller.viewName, expect.objectContaining({ baseModel: 'data' }))
    })

    it('uses the maximum grant rate configured for the page', () => {
      mockRequest.app.model.def.metadata.pageConfig['/total-estimated-cost'].costs.grantMaxRate = 0.25
      mockContext.state.itemsPlanningToInstall = ['RESERVOIR']

      expect(controller.getCalculatedAnswers(mockRequest, mockContext.state).estimatedMaxGrant).toBe(62.5)
    })

    it('should calculate costs correctly when network and tank items are selected', async () => {
      mockContext.state.itemsPlanningToInstall = ['WATER_DISTRIBUTION_NETWORK', 'WATER_STORAGE_TANKS']

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mergeAdditionalAnswers).toHaveBeenCalledWith(expect.anything(), {
        reservoirHighCostPerUnit: 2.5,
        reservoirLowCostPerUnit: 2.0,
        distNetworkCostPerUnit: 5,
        tanksCostPerUnit: 1.5,
        reservoirCost: 0,
        waterDistributionNetworkCost: 250,
        waterTanksCost: 300,
        totalEstimatedCost: 550,
        estimatedMaxGrantBeforeReduction: 220,
        estimatedMaxGrant: 220,
        minGrantReached: false,
        maxGrantReached: false
      })
      expect(controller.setState).toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(controller.viewName, expect.objectContaining({ baseModel: 'data' }))
    })

    it('should handle synthetic reservoir lining', () => {
      mockContext.state.itemsPlanningToInstall = ['RESERVOIR']
      mockContext.state.reservoirLining = 'synthetic'
      mockContext.state.howMuchWater = 100

      const results = controller.getCalculatedAnswers(mockRequest, mockContext.state)

      expect(results.reservoirHighCostPerUnit).toBe(3.5)
      expect(results.reservoirLowCostPerUnit).toBe(3.0)
      expect(results.reservoirCost).toBe(350)
    })

    it('should calculate tiered reservoir cost for large volumes', () => {
      mockContext.state.itemsPlanningToInstall = ['RESERVOIR']
      mockContext.state.reservoirLining = 'clay'
      mockContext.state.howMuchWater = 15000 // 10000 * 2.5 + 5000 * 2.0 = 25000 + 10000 = 35000

      const results = controller.getCalculatedAnswers(mockRequest, mockContext.state)

      expect(results.reservoirCost).toBe(35000)
    })

    it('should set minGrantReached to true when total estimated grant is at or above £35,000 for reservoir', () => {
      mockContext.state.itemsPlanningToInstall = ['RESERVOIR']
      mockContext.state.howMuchWater = 35000 // 35000 * 2.5 (avg 2.5) * 0.4 = ... wait
      // totalEstimatedCost = 10000 * 2.5 + 25000 * 2.0 = 25000 + 50000 = 75000
      // estimatedMaxGrant = 75000 * 0.4 = 30000 (still below 35000)

      mockContext.state.howMuchWater = 50000
      // totalEstimatedCost = 10000 * 2.5 + 40000 * 2.0 = 25000 + 80000 = 105000
      // estimatedMaxGrant = 105000 * 0.4 = 42000 (above 35000)

      const results = controller.getCalculatedAnswers(mockRequest, mockContext.state)
      expect(results.minGrantReached).toBe(true)
    })

    it('should set minGrantReached to true when total estimated grant is at or above £15,000 for tanks only', () => {
      mockContext.state.itemsPlanningToInstall = ['WATER_STORAGE_TANKS']
      mockContext.state.waterStorageCapacity = 25000 // 25000 * 1.5 = 37500
      // estimatedMaxGrant = 37500 * 0.4 = 15000

      const results = controller.getCalculatedAnswers(mockRequest, mockContext.state)
      expect(results.minGrantReached).toBe(true)
    })

    it('should cap estimatedMaxGrant at £350,000 and set maxGrantReached to true', () => {
      mockContext.state.itemsPlanningToInstall = ['WATER_STORAGE_TANKS']
      mockContext.state.waterStorageCapacity = 1000000 // 1,000,000 * 1.5 = 1,500,000
      // estimatedMaxGrantBeforeReduction = 1,500,000 * 0.4 = 600,000

      const results = controller.getCalculatedAnswers(mockRequest, mockContext.state)
      expect(results.estimatedMaxGrantBeforeReduction).toBe(600000)
      expect(results.estimatedMaxGrant).toBe(350000)
      expect(results.maxGrantReached).toBe(true)
    })

    it('uses the derived-state settings from the page definition', () => {
      expect(controller.derivedState).toMatchObject({
        requiresAcknowledgement: true
      })
      expect(controller.derivedState.stateKeys).toContain('totalEstimatedCost')
    })

    it('should throw if costs configuration is missing from the page definition', async () => {
      mockRequest.app.model.def.metadata.pageConfig['/total-estimated-cost'].costs = undefined

      const handler = controller.makeGetRouteHandler()

      try {
        await handler(mockRequest, mockContext, mockH)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).toBe('Failed to refresh derived answers')
        const [cause] = error.causeErrors
        expect(cause.message).toBe('Missing required configuration: config.costs')
      }
    })

    it('should throw and report all missing cost units', async () => {
      mockRequest.app.model.def.metadata.pageConfig['/total-estimated-cost'].costs = {}

      const handler = controller.makeGetRouteHandler()

      try {
        await handler(mockRequest, mockContext, mockH)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).toBe('Failed to refresh derived answers')
        const [cause] = error.causeErrors
        expect(cause.message).toBe(
          'Missing required configuration: config.costs.reservoirClayHighCostPerUnit, config.costs.reservoirClayLowCostPerUnit, config.costs.reservoirSyntheticHighCostPerUnit, config.costs.reservoirSyntheticLowCostPerUnit, config.costs.distNetworkCostPerUnit, config.costs.tanksCostPerUnit, config.costs.grantMaxRate'
        )
      }
    })

    it('should throw if any reservoir cost unit is missing', async () => {
      mockRequest.app.model.def.metadata.pageConfig['/total-estimated-cost'].costs = {
        distNetworkCostPerUnit: 5,
        tanksCostPerUnit: 1.5,
        grantMaxRate: 0.4
      }

      const handler = controller.makeGetRouteHandler()

      try {
        await handler(mockRequest, mockContext, mockH)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).toBe('Failed to refresh derived answers')
        const [cause] = error.causeErrors
        expect(cause.message).toBe(
          'Missing required configuration: config.costs.reservoirClayHighCostPerUnit, config.costs.reservoirClayLowCostPerUnit, config.costs.reservoirSyntheticHighCostPerUnit, config.costs.reservoirSyntheticLowCostPerUnit'
        )
      }
    })
  })

  describe('isStateStale', () => {
    it('returns true when an item selection has changed the calculated total', async () => {
      mockContext.state.itemsPlanningToInstall = ['RESERVOIR']
      mockContext.state.additionalAnswers = {
        reservoirHighCostPerUnit: 2.5,
        reservoirLowCostPerUnit: 2.0,
        distNetworkCostPerUnit: 5,
        tanksCostPerUnit: 1.5,
        reservoirCost: 250,
        waterDistributionNetworkCost: 250,
        waterTanksCost: 300,
        totalEstimatedCost: 800,
        estimatedMaxGrantBeforeReduction: 320,
        estimatedMaxGrant: 320,
        minGrantReached: false,
        maxGrantReached: false
      }

      await expect(controller.isStateStale(mockRequest, mockContext)).resolves.toBe(true)
    })

    it('returns false when all saved calculated values match', async () => {
      mockContext.state.additionalAnswers = {
        reservoirHighCostPerUnit: 2.5,
        reservoirLowCostPerUnit: 2.0,
        distNetworkCostPerUnit: 5,
        tanksCostPerUnit: 1.5,
        reservoirCost: 0,
        waterDistributionNetworkCost: 0,
        waterTanksCost: 0,
        totalEstimatedCost: 0,
        estimatedMaxGrantBeforeReduction: 0,
        estimatedMaxGrant: 0,
        minGrantReached: false,
        maxGrantReached: false
      }

      await expect(controller.isStateStale(mockRequest, mockContext)).resolves.toBe(false)
    })
  })

  describe('getNextPath', () => {
    it('should return super.getNextPath(context) when minGrantReached is true', () => {
      mockContext.state.additionalAnswers = { minGrantReached: true }
      // The controller instance already has getNextPath mocked by setupControllerMocks
      // We need to bypass the instance mock to test the class implementation
      const originalInstanceGetNextPath = controller.getNextPath
      delete controller.getNextPath

      const superGetNextPath = QuestionPageController.prototype.getNextPath
      QuestionPageController.prototype.getNextPath = vi.fn().mockReturnValue('/next-page')

      try {
        const result = controller.getNextPath(mockContext)
        expect(result).toBe('/next-page')
      } finally {
        QuestionPageController.prototype.getNextPath = superGetNextPath
        controller.getNextPath = originalInstanceGetNextPath
      }
    })

    it('should return /exit-total-estimated-cost when minGrantReached is false', () => {
      mockContext.state.additionalAnswers = { minGrantReached: false }
      const originalInstanceGetNextPath = controller.getNextPath
      delete controller.getNextPath

      const superGetNextPath = QuestionPageController.prototype.getNextPath
      QuestionPageController.prototype.getNextPath = vi.fn().mockReturnValue('/next-page')

      try {
        const result = controller.getNextPath(mockContext)
        expect(result).toBe('/exit-total-estimated-cost')
      } finally {
        QuestionPageController.prototype.getNextPath = superGetNextPath
        controller.getNextPath = originalInstanceGetNextPath
      }
    })
  })
})
