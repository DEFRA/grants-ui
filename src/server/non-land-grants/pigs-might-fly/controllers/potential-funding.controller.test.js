import { vi } from 'vitest'
import { PotentialFundingController } from './potential-funding.controller.js'
import { invokeGasPostAction } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

vi.mock('~/src/server/common/services/grant-application/grant-application.service.js')
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    SYSTEM: {
      GAS_ACTION_ERROR: { level: 'error', messageFunc: vi.fn() }
    }
  }
}))

describe('PotentialFundingController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockResponseToolkit

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Potential Funding'
    })

    controller = new PotentialFundingController(
      {
        def: {
          metadata: {
            submission: {
              grantCode: 'pigs-might-fly'
            }
          }
        }
      },
      {
        title: 'Test Page'
      }
    )

    mockRequest = {
      method: 'GET'
    }

    mockContext = {
      state: {
        whitePigsCount: 10,
        britishLandracePigsCount: 5,
        berkshirePigsCount: 3,
        otherPigsCount: 2
      },
      pigData: null,
      pigDataJson: null
    }

    mockResponseToolkit = {
      view: vi.fn(),
      redirect: vi.fn()
    }

    invokeGasPostAction.mockReset()
  })

  describe('makeGetRouteHandler', () => {
    it('should call invokeGasPostAction with correct payload and render the view', async () => {
      const handler = controller.makeGetRouteHandler()

      const mockResult = {
        items: [
          { type: 'largeWhite', value: 50 },
          { type: 'britishLandrace', value: 25 },
          { type: 'berkshire', value: 15 },
          { type: 'other', value: 10 }
        ],
        pigsData: { totalPigs: 100 }
      }
      invokeGasPostAction.mockResolvedValue(mockResult)

      await handler(mockRequest, mockContext, mockResponseToolkit)

      expect(invokeGasPostAction).toHaveBeenCalledTimes(1)
      expect(invokeGasPostAction).toHaveBeenCalledWith(
        'pigs-might-fly',
        'calculate-pig-totals',
        {
          pigTypes: [
            { pigType: 'largeWhite', quantity: 10 },
            { pigType: 'britishLandrace', quantity: 5 },
            { pigType: 'berkshire', quantity: 3 },
            { pigType: 'other', quantity: 2 }
          ]
        },
        mockRequest
      )

      expect(mockContext.pigData).toEqual({
        largeWhite: { type: 'largeWhite', value: 50 },
        britishLandrace: { type: 'britishLandrace', value: 25 },
        berkshire: { type: 'berkshire', value: 15 },
        other: { type: 'other', value: 10 }
      })
      expect(mockContext.pigDataJson).toEqual(JSON.stringify({ totalPigs: 100 }))
      expect(mockResponseToolkit.view).toHaveBeenCalledWith('potential-funding', expect.any(Object))
    })

    it('should handle undefined pig counts with fallback to 0', async () => {
      const handler = controller.makeGetRouteHandler()

      // Set up context with missing pig counts
      mockContext.state = {
        whitePigsCount: undefined,
        britishLandracePigsCount: null,
        berkshirePigsCount: 0,
        otherPigsCount: 5
      }

      const mockResult = {
        items: [
          { type: 'largeWhite', value: 50 },
          { type: 'britishLandrace', value: 25 },
          { type: 'berkshire', value: 15 },
          { type: 'other', value: 10 }
        ],
        pigsData: { totalPigs: 100 }
      }
      invokeGasPostAction.mockResolvedValue(mockResult)

      await handler(mockRequest, mockContext, mockResponseToolkit)

      expect(invokeGasPostAction).toHaveBeenCalledWith(
        'pigs-might-fly',
        'calculate-pig-totals',
        {
          pigTypes: [
            { pigType: 'largeWhite', quantity: 0 }, // undefined || 0
            { pigType: 'britishLandrace', quantity: 0 }, // null || 0
            { pigType: 'berkshire', quantity: 0 }, // 0 || 0
            { pigType: 'other', quantity: 5 } // 5 || 0
          ]
        },
        mockRequest
      )
    })

    it('should log and throw an error if invokeGasPostAction fails', async () => {
      const handler = controller.makeGetRouteHandler()

      const mockError = new Error('Test Error')
      invokeGasPostAction.mockRejectedValue(mockError)

      await expect(handler(mockRequest, mockContext, mockResponseToolkit)).rejects.toThrow(mockError)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.GAS_ACTION_ERROR,
        { grantCode: 'pigs-might-fly', action: 'calculate-pig-totals', errorMessage: 'Test Error' },
        mockRequest
      )
    })
  })

  describe('makePostRouteHandler', () => {
    beforeEach(() => {
      // Mock `proceed` and `getNextPath` in the controller
      controller.proceed = vi.fn().mockReturnValue('redirectedPath')
      controller.getNextPath = vi.fn().mockReturnValue('/next-path')
    })

    it('should call proceed with the next path', async () => {
      const handler = controller.makePostRouteHandler()

      vi.spyOn(controller, 'proceed').mockReturnValue('nextPath')

      const result = await handler(mockRequest, mockContext, mockResponseToolkit)

      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockResponseToolkit,
        controller.getNextPath(mockContext)
      )
      expect(result).toBe('nextPath')
    })
  })
})
