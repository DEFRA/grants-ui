import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { invokeGasPostAction } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { PotentialFundingController } from './potential-funding.controller.js'

jest.mock('@defra/forms-model')
jest.mock('@defra/forms-engine-plugin/engine/components/ComponentCollection.js')
jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')
jest.mock(
  '~/src/server/common/services/grant-application/grant-application.service.js'
)

describe('PotentialFundingController', () => {
  let controller
  let mockModel
  let mockPageDef
  let mockRequest
  let mockContext

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Potential Funding'
    })

    mockModel = {
      def: {
        metadata: {
          submission: {
            grantCode: 'pigs-might-fly'
          }
        }
      }
    }

    mockPageDef = {
      title: 'Potential Funding',
      path: '/potential-funding',
      components: [{ name: 'testComponent', type: 'TextField' }]
    }

    controller = new PotentialFundingController(mockModel, mockPageDef)

    mockRequest = {
      method: 'GET',
      url: '/potential-funding'
    }

    mockContext = {
      state: {
        whitePigsCount: 10,
        britishLandracePigsCount: 5,
        berkshirePigsCount: 3,
        otherPigsCount: 2
      }
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getViewModel', () => {
    test('should create correct payload with pig breeds from context state', () => {
      const expectedPayload = {
        pigBreeds: [
          {
            pigType: 'largeWhite',
            quantity: 10
          },
          {
            pigType: 'landrace',
            quantity: 5
          },
          {
            pigType: 'berkshire',
            quantity: 3
          },
          {
            pigType: 'other',
            quantity: 2
          }
        ]
      }

      invokeGasPostAction.mockResolvedValue({ totalFunding: 100 })

      controller.getViewModel(mockRequest, mockContext)

      expect(invokeGasPostAction).toHaveBeenCalledWith(
        'pigs-might-fly',
        'calculate-pig-totals',
        expectedPayload
      )
    })

    test('should use default values of 0 when pig counts are missing from state', () => {
      const contextWithPartialData = {
        state: {
          whitePigsCount: 15
        }
      }

      const expectedPayload = {
        pigBreeds: [
          {
            pigType: 'largeWhite',
            quantity: 15
          },
          {
            pigType: 'landrace',
            quantity: 0
          },
          {
            pigType: 'berkshire',
            quantity: 0
          },
          {
            pigType: 'other',
            quantity: 0
          }
        ]
      }

      invokeGasPostAction.mockResolvedValue({ totalFunding: 150 })

      controller.getViewModel(mockRequest, contextWithPartialData)

      expect(invokeGasPostAction).toHaveBeenCalledWith(
        'pigs-might-fly',
        'calculate-pig-totals',
        expectedPayload
      )
    })

    test('should handle empty state object gracefully', () => {
      const emptyStateContext = { state: {} }

      const expectedPayload = {
        pigBreeds: [
          { pigType: 'largeWhite', quantity: 0 },
          { pigType: 'landrace', quantity: 0 },
          { pigType: 'berkshire', quantity: 0 },
          { pigType: 'other', quantity: 0 }
        ]
      }

      invokeGasPostAction.mockResolvedValue({ totalFunding: 0 })

      controller.getViewModel(mockRequest, emptyStateContext)

      expect(invokeGasPostAction).toHaveBeenCalledWith(
        'pigs-might-fly',
        'calculate-pig-totals',
        expectedPayload
      )
    })

    test('should call super.getViewModel and return its result', () => {
      const mockSuperResult = { pageTitle: 'Potential Funding', formData: true }
      QuestionPageController.prototype.getViewModel = jest
        .fn()
        .mockReturnValue(mockSuperResult)

      const result = controller.getViewModel(mockRequest, mockContext)

      expect(
        QuestionPageController.prototype.getViewModel
      ).toHaveBeenCalledWith(mockRequest, mockContext)
      expect(result).toEqual(mockSuperResult)
    })

    test('should handle successful pig data response and set pigData on context', async () => {
      const mockPigData = {
        totalFunding: 420,
        breakdown: [
          { breed: 'largeWhite', count: 10, funding: 100 },
          { breed: 'landrace', count: 5, funding: 75 },
          { breed: 'berkshire', count: 3, funding: 54 },
          { breed: 'other', count: 2, funding: 20 }
        ]
      }
      invokeGasPostAction.mockResolvedValue(mockPigData)

      controller.getViewModel(mockRequest, mockContext)

      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockContext.pigData).toEqual(mockPigData)
    })

    test('should handle service errors gracefully without throwing', async () => {
      const mockError = new Error('GAS service unavailable')
      invokeGasPostAction.mockRejectedValue(mockError)

      expect(() => {
        controller.getViewModel(mockRequest, mockContext)
      }).not.toThrow()

      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockContext.pigData).toBeUndefined()
    })

    test('should handle all pig counts being zero', () => {
      const zeroCountContext = {
        state: {
          whitePigsCount: 0,
          britishLandracePigsCount: 0,
          berkshirePigsCount: 0,
          otherPigsCount: 0
        }
      }

      const expectedPayload = {
        pigBreeds: [
          { pigType: 'largeWhite', quantity: 0 },
          { pigType: 'landrace', quantity: 0 },
          { pigType: 'berkshire', quantity: 0 },
          { pigType: 'other', quantity: 0 }
        ]
      }

      invokeGasPostAction.mockResolvedValue({ totalFunding: 0 })

      controller.getViewModel(mockRequest, zeroCountContext)

      expect(invokeGasPostAction).toHaveBeenCalledWith(
        'pigs-might-fly',
        'calculate-pig-totals',
        expectedPayload
      )
    })

    test('should create promise that handles both resolve and reject paths', async () => {
      const successData = { totalFunding: 300 }
      invokeGasPostAction.mockResolvedValueOnce(successData)

      controller.getViewModel(mockRequest, mockContext)
      await new Promise(setImmediate)

      expect(mockContext.pigData).toEqual(successData)

      delete mockContext.pigData

      const errorMessage = 'Network error'
      invokeGasPostAction.mockRejectedValueOnce(new Error(errorMessage))

      controller.getViewModel(mockRequest, mockContext)
      await new Promise(setImmediate)

      expect(mockContext.pigData).toBeUndefined()
    })

    test('should handle large pig counts correctly', () => {
      const largeCountContext = {
        state: {
          whitePigsCount: 999,
          britishLandracePigsCount: 500,
          berkshirePigsCount: 300,
          otherPigsCount: 100
        }
      }

      const expectedPayload = {
        pigBreeds: [
          { pigType: 'largeWhite', quantity: 999 },
          { pigType: 'landrace', quantity: 500 },
          { pigType: 'berkshire', quantity: 300 },
          { pigType: 'other', quantity: 100 }
        ]
      }

      invokeGasPostAction.mockResolvedValue({ totalFunding: 18990 })

      controller.getViewModel(mockRequest, largeCountContext)

      expect(invokeGasPostAction).toHaveBeenCalledWith(
        'pigs-might-fly',
        'calculate-pig-totals',
        expectedPayload
      )
    })
  })
})
