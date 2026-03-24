import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { vi } from 'vitest'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import { getRequiredConsents } from '~/src/server/land-grants/view-state/land-parcel.view-state.js'
import PaymentPageController from './payment-page.controller.js'

const mockStrategyFetch = vi.hoisted(() => vi.fn())

vi.mock('~/src/server/payment/payment-strategies.js', () => ({
  paymentStrategies: {
    multiAction: {
      fetch: mockStrategyFetch
    }
  }
}))

vi.mock('~/src/server/land-grants/utils/format-parcel.js', () => ({
  stringifyParcel: ({ parcelId, sheetId }) => `${sheetId}-${parcelId}`
}))

vi.mock('~/src/server/land-grants/view-state/land-parcel.view-state.js', () => ({
  getRequiredConsents: vi.fn()
}))

describe('PaymentPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const mockPayment = {
    annualTotalPence: 32006,
    parcelItems: {
      1: {
        code: 'CMOR1',
        description: 'Assess moorland and produce a written record: CMOR1',
        quantity: 4.53,
        annualPaymentPence: 4806,
        sheetId: 'SD6743',
        parcelId: '8083'
      }
    },
    agreementLevelItems: {
      1: {
        code: 'MAN1',
        description: 'Management payment',
        annualPaymentPence: 27200
      }
    }
  }

  const mockStrategyResult = {
    totalPence: 32006,
    payment: mockPayment,
    parcelItems: [{ text: 'sheet1-parcel1' }],
    additionalYearlyPayments: []
  }

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Check selected land actions'
    })

    const mockModel = {
      def: {
        metadata: {
          pageConfig: {
            '/test': {
              paymentStrategy: 'multiAction',
              nextPath: '/submit-your-application',
              addMoreActionsPath: '/select-land-parcel',
              consentPath: '/you-must-have-consent'
            }
          }
        }
      }
    }
    const mockPageDef = { path: '/test' }
    controller = new PaymentPageController(mockModel, mockPageDef)
    controller.collection = {
      getErrors: vi.fn().mockReturnValue([])
    }
    controller.setState = vi.fn().mockResolvedValue(true)
    controller.proceed = vi.fn().mockReturnValue('redirected')
    controller.getSelectedActionRows = vi
      .fn()
      .mockReturnValue([[{ text: 'sheet1-parcel1' }, { text: 'Test Action' }, { text: '10 hectares' }]])

    mockStrategyFetch.mockResolvedValue(mockStrategyResult)
    getRequiredConsents.mockReturnValue([])

    mockRequest = {
      payload: {},
      logger: mockRequestLogger()
    }
    mockContext = {
      state: {
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: { ACTION1: { value: '10.5' } }
          }
        }
      }
    }
    mockH = {
      view: vi.fn().mockReturnValue('rendered view'),
      redirect: vi.fn().mockReturnValue('redirected')
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('GET Handler - Payment Display', () => {
    test('should fetch payment data and display summary', async () => {
      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(mockStrategyFetch).toHaveBeenCalled()
      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          totalPence: 32006,
          payment: mockPayment
        })
      )
      expect(mockH.view).toHaveBeenCalledWith(
        'payment-page',
        expect.objectContaining({
          totalPayment: '£320.06'
        })
      )
    })

    test('should handle zero payment correctly', async () => {
      mockStrategyFetch.mockResolvedValue({
        totalPence: 0,
        payment: { annualTotalPence: 0, parcelItems: {}, agreementLevelItems: {} },
        parcelItems: [],
        additionalYearlyPayments: []
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'payment-page',
        expect.objectContaining({
          totalPayment: '£0.00'
        })
      )
    })

    test('should handle missing auth when error occurs', async () => {
      const requestWithoutAuth = { payload: {} }
      mockStrategyFetch.mockRejectedValue(new Error('API error'))

      const handler = controller.makeGetRouteHandler()
      await handler(requestWithoutAuth, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'payment-page',
        expect.objectContaining({
          errors: [
            {
              text: 'Unable to get payment information, please try again later or contact the Rural Payments Agency.'
            }
          ]
        })
      )
    })

    test('should handle missing credentials when error occurs', async () => {
      const requestWithoutCredentials = { auth: {}, payload: {} }
      mockStrategyFetch.mockRejectedValue(new Error('API error'))

      const handler = controller.makeGetRouteHandler()
      await handler(requestWithoutCredentials, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'payment-page',
        expect.objectContaining({
          errors: [
            {
              text: 'Unable to get payment information, please try again later or contact the Rural Payments Agency.'
            }
          ]
        })
      )
    })
  })

  describe('POST Handler - Form Validation', () => {
    test('should show validation error when user must choose but does not', async () => {
      mockRequest.payload = { action: 'validate' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'payment-page',
        expect.objectContaining({
          errors: [{ href: '#addMoreActions', text: 'Select if you want to add an action to another land parcel' }]
        })
      )
      expect(controller.proceed).not.toHaveBeenCalled()
    })

    test('should handle missing payment data gracefully in validation error', async () => {
      mockContext.state = { landParcels: {} }
      mockRequest.payload = { action: 'validate' }

      const handler = controller.makePostRouteHandler()

      expect(async () => {
        await handler(mockRequest, mockContext, mockH)
      }).not.toThrow()
    })

    test('should redirect to add more actions when user chooses yes', async () => {
      mockRequest.payload = { addMoreActions: 'true' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/select-land-parcel')
    })

    test('should continue to next step when user chooses no', async () => {
      mockRequest.payload = { addMoreActions: 'false' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
    })

    test('should proceed normally when no validation required', async () => {
      mockRequest.payload = {}

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
      expect(mockH.view).not.toHaveBeenCalled()
    })

    test('should handle errors when fetching payment data for validation error', async () => {
      mockRequest.payload = { action: 'validate' }
      mockStrategyFetch.mockRejectedValue(new Error('Payment calculation failed'))

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'payment-page',
        expect.objectContaining({
          errors: [{ href: '#addMoreActions', text: 'Select if you want to add an action to another land parcel' }],
          parcelItems: [],
          additionalYearlyPayments: []
        })
      )
      expect(result).toBe('rendered view')
    })

    test('should handle timeout when calculating grant payment gracefully', async () => {
      mockStrategyFetch.mockRejectedValue(new Error('Operation timed out after 30000ms'))

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'payment-page',
        expect.objectContaining({
          errors: [
            {
              text: 'Unable to get payment information, please try again later or contact the Rural Payments Agency.'
            }
          ]
        })
      )
    })
  })

  describe('makeGetRouteHandler', () => {
    test('should render an error if process payment calculation fails', async () => {
      mockStrategyFetch.mockRejectedValue(new Error('error'))

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'payment-page',
        expect.objectContaining({
          errors: [
            {
              text: 'Unable to get payment information, please try again later or contact the Rural Payments Agency.'
            }
          ]
        })
      )
    })

    test('should handle undefined totalPence in view model', () => {
      const viewModel = controller.buildViewModel(mockRequest, mockContext, undefined, [], [])
      expect(viewModel.totalPayment).toBe('£0.00')
    })

    test('should handle zero totalPence in view model', () => {
      const viewModel = controller.buildViewModel(mockRequest, mockContext, 0, [], [])
      expect(viewModel.totalPayment).toBe('£0.00')
    })

    test('should handle a valid totalPence in view model', () => {
      const viewModel = controller.buildViewModel(mockRequest, mockContext, 32006, [], [])
      expect(viewModel.totalPayment).toBe('£320.06')
    })
  })

  describe('POST Handler - Consent Handling', () => {
    test('should redirect to consent page when consents are required', async () => {
      mockRequest.payload = { addMoreActions: 'false' }
      getRequiredConsents.mockReturnValue(['sssi'])

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          requiredConsents: ['sssi']
        })
      )
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/you-must-have-consent')
    })

    test('should redirect to submit application when no consents required', async () => {
      mockRequest.payload = { addMoreActions: 'false' }
      getRequiredConsents.mockReturnValue([])

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          requiredConsents: []
        })
      )
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
    })

    test('should handle multiple consent types', async () => {
      mockRequest.payload = { addMoreActions: 'false' }
      getRequiredConsents.mockReturnValue(['sssi', 'hefer'])

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          requiredConsents: ['sssi', 'hefer']
        })
      )
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/you-must-have-consent')
    })

    test('should call getRequiredConsents with state when user chooses not to add more actions', async () => {
      mockRequest.payload = { addMoreActions: 'false' }
      getRequiredConsents.mockReturnValue([])

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(getRequiredConsents).toHaveBeenCalledWith(mockContext.state)
    })

    test('should not call getRequiredConsents when user chooses to add more actions', async () => {
      mockRequest.payload = { addMoreActions: 'true' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(getRequiredConsents).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/select-land-parcel')
    })
  })

  describe('getNextPathFromSelection', () => {
    test('should return consent page path when consents are required', () => {
      getRequiredConsents.mockReturnValue(['sssi'])

      const result = controller.getNextPathFromSelection('false', mockContext.state)

      expect(result).toEqual({
        path: '/you-must-have-consent',
        requiredConsents: ['sssi']
      })
    })

    test('should return submit application path when no consents required', () => {
      getRequiredConsents.mockReturnValue([])

      const result = controller.getNextPathFromSelection('false', mockContext.state)

      expect(result).toEqual({
        path: '/submit-your-application'
      })
    })

    test('should return select parcel path when adding more actions', () => {
      const result = controller.getNextPathFromSelection('true', mockContext.state)

      expect(result).toEqual({
        path: '/select-land-parcel'
      })
      expect(getRequiredConsents).not.toHaveBeenCalled()
    })

    test('should skip consent check and go to nextPath when consentPath is not configured', () => {
      const model = {
        def: {
          metadata: {
            pageConfig: {
              '/test': {
                paymentStrategy: 'multiAction',
                nextPath: '/done',
                addMoreActionsPath: '/add-more'
              }
            }
          }
        }
      }
      const ctrl = new PaymentPageController(model, { path: '/test' })
      ctrl.collection = { getErrors: vi.fn().mockReturnValue([]) }

      getRequiredConsents.mockReturnValue(['sssi'])

      const result = ctrl.getNextPathFromSelection('false', mockContext.state)

      expect(getRequiredConsents).not.toHaveBeenCalled()
      expect(result).toEqual({ path: '/done' })
    })
  })

  describe('constructor validation', () => {
    test('should throw when nextPath is missing', () => {
      const model = {
        def: {
          metadata: {
            pageConfig: { '/test': { paymentStrategy: 'multiAction' } }
          }
        }
      }
      expect(() => new PaymentPageController(model, { path: '/test' })).toThrow(
        'PaymentPageController: "nextPath" is required'
      )
    })

    test('should throw when addMoreActionsPath is missing and showAddMoreActionsQuestion is true', () => {
      const model = {
        def: {
          metadata: {
            pageConfig: {
              '/test': { paymentStrategy: 'multiAction', nextPath: '/done', showAddMoreActionsQuestion: true }
            }
          }
        }
      }
      expect(() => new PaymentPageController(model, { path: '/test' })).toThrow(
        'PaymentPageController: "addMoreActionsPath" is required'
      )
    })

    test('should not throw when addMoreActionsPath is missing and showAddMoreActionsQuestion is false', () => {
      const model = {
        def: {
          metadata: {
            pageConfig: {
              '/test': { paymentStrategy: 'multiAction', nextPath: '/done', showAddMoreActionsQuestion: false }
            }
          }
        }
      }
      expect(() => new PaymentPageController(model, { path: '/test' })).not.toThrow()
    })
  })
})
