import { PotentialFundingController } from './potential-funding.controller.js'
import { invokeGasPostAction } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

jest.mock(
  '~/src/server/common/services/grant-application/grant-application.service.js'
)

describe('PotentialFundingController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockResponseToolkit

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = jest.fn().mockReturnValue({
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
      method: 'GET',
      logger: {
        error: jest.fn()
      }
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
      view: jest.fn(),
      redirect: jest.fn()
    }

    invokeGasPostAction.mockReset()
  })

  describe('makeGetRouteHandler', () => {
    it('should call invokeGasPostAction with correct payload and render the view', async () => {
      const handler = controller.makeGetRouteHandler()

      const mockResult = {
        items: [
          { type: 'largeWhite', value: 50 },
          { type: 'landrace', value: 25 },
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
            { pigType: 'landrace', quantity: 5 },
            { pigType: 'berkshire', quantity: 3 },
            { pigType: 'other', quantity: 2 }
          ]
        }
      )

      expect(mockContext.pigData).toEqual({
        largeWhite: { type: 'largeWhite', value: 50 },
        landrace: { type: 'landrace', value: 25 },
        berkshire: { type: 'berkshire', value: 15 },
        other: { type: 'other', value: 10 }
      })
      expect(mockContext.pigDataJson).toEqual(
        JSON.stringify({ totalPigs: 100 })
      )
      expect(mockResponseToolkit.view).toHaveBeenCalledWith(
        'non-land-grants/flying-pigs/potential-funding',
        expect.any(Object)
      )
    })

    it('should log and throw an error if invokeGasPostAction fails', async () => {
      const handler = controller.makeGetRouteHandler()

      const mockError = new Error('Test Error')
      invokeGasPostAction.mockRejectedValue(mockError)

      await expect(
        handler(mockRequest, mockContext, mockResponseToolkit)
      ).rejects.toThrow(mockError)

      expect(mockRequest.logger.error).toHaveBeenCalledWith(
        'Error invoking GAS action:',
        mockError
      )
    })
  })

  describe('makePostRouteHandler', () => {
    beforeEach(() => {
      // Mock `proceed` and `getNextPath` in the controller
      controller.proceed = jest.fn().mockReturnValue('redirectedPath')
      controller.getNextPath = jest.fn().mockReturnValue('/next-path')
    })

    it('should call proceed with the next path', () => {
      const handler = controller.makePostRouteHandler()

      jest.spyOn(controller, 'proceed').mockReturnValue('nextPath')

      const result = handler(mockRequest, mockContext, mockResponseToolkit)

      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockResponseToolkit,
        controller.getNextPath(mockContext)
      )
      expect(result).toBe('nextPath')
    })
  })
})
