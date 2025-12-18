import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { vi } from 'vitest'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import { calculateGrantPayment } from '../services/land-grants.service.js'
import LandActionsCheckPageController from './land-actions-check-page.controller.js'

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  actionGroups: [{ actions: ['CMOR1'] }, { actions: ['UPL1', 'UPL2', 'UPL3'] }],
  calculateGrantPayment: vi.fn()
}))

vi.mock('~/src/server/land-grants/utils/format-parcel.js', () => ({
  stringifyParcel: ({ parcelId, sheetId }) => `${sheetId}-${parcelId}`
}))

describe('LandActionsCheckPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const mockPaymentResponse = {
    payment: {
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
  }

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Check selected land actions'
    })

    controller = new LandActionsCheckPageController()
    controller.collection = {
      getErrors: vi.fn().mockReturnValue([])
    }
    controller.setState = vi.fn().mockResolvedValue(true)
    controller.proceed = vi.fn().mockReturnValue('redirected')
    controller.getSelectedActionRows = vi
      .fn()
      .mockReturnValue([[{ text: 'sheet1-parcel1' }, { text: 'Test Action' }, { text: '10 hectares' }]])

    // actionGroups.mockReturnValue([{ actions: ['CMOR1'] }, { actions: ['UPL1', 'UPL2', 'UPL3'] }])
    calculateGrantPayment.mockResolvedValue(mockPaymentResponse)

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

      expect(calculateGrantPayment).toHaveBeenCalled()
      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          payment: mockPaymentResponse.payment,
          draftApplicationAnnualTotalPence: 32006
        })
      )
      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          totalYearlyPayment: '£320.06'
        })
      )
    })

    test('should handle zero payment correctly', async () => {
      calculateGrantPayment.mockResolvedValue({
        payment: { annualTotalPence: 0, parcelItems: {}, agreementLevelItems: {} }
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          totalYearlyPayment: '£0.00'
        })
      )
    })

    test('should handle missing auth when error occurs', async () => {
      const requestWithoutAuth = { payload: {} }
      calculateGrantPayment.mockRejectedValue(new Error('API error'))

      const handler = controller.makeGetRouteHandler()
      await handler(requestWithoutAuth, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
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
      calculateGrantPayment.mockRejectedValue(new Error('API error'))

      const handler = controller.makeGetRouteHandler()
      await handler(requestWithoutCredentials, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
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
        'land-actions-check',
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
      calculateGrantPayment.mockRejectedValue(new Error('Payment calculation failed'))

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          errors: [{ href: '#addMoreActions', text: 'Select if you want to add an action to another land parcel' }],
          parcelItems: [],
          additionalYearlyPayments: []
        })
      )
      expect(result).toBe('rendered view')
    })

    test('should handle timeout when calculating grant payment gracefully', async () => {
      calculateGrantPayment.mockRejectedValue(new Error('Operation timed out after 30000ms'))

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
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
      calculateGrantPayment.mockRejectedValue(new Error('error'))

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          errors: [
            {
              text: 'Unable to get payment information, please try again later or contact the Rural Payments Agency.'
            }
          ]
        })
      )
    })

    test('should handle undefined payment in view model', () => {
      const viewModel = controller.buildGetViewModel(mockRequest, mockContext, undefined, [], [])
      expect(viewModel.totalYearlyPayment).toBe('£0.00')
    })

    test('should handle null payment in view model', () => {
      const viewModel = controller.buildGetViewModel(mockRequest, mockContext, null, [], [])
      expect(viewModel.totalYearlyPayment).toBe('£0.00')
    })

    test('should handle payment without annualTotalPence property', () => {
      const paymentWithoutTotal = {}
      const viewModel = controller.buildGetViewModel(mockRequest, mockContext, paymentWithoutTotal, [], [])
      expect(viewModel.totalYearlyPayment).toBe('£0.00')
    })
  })
})
