import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import ConfirmLandAndActionsPageController from './confirm-land-and-actions-page.controller.js'
import { calculateLandActionsPayment } from '~/src/server/land-grants/services/land-grants.service.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  calculateLandActionsPayment: vi.fn()
}))

const landParcels = {
  'SD1234-5678': {
    actionsObj: {
      CLIG3: { value: '2', unit: 'ha' },
      CSAM3: { value: '4', unit: 'ha' }
    }
  },
  'CD9999-1111': {
    actionsObj: {
      SCR2: { value: '1', unit: 'ha' }
    }
  }
}

const payment = {
  annualTotalPence: 123400,
  parcelItems: {
    1: {
      code: 'CLIG3',
      description: 'Action description',
      sheetId: 'SD1234',
      parcelId: '5678',
      quantity: 2,
      unit: 'ha',
      annualPaymentPence: 10000
    },
    2: {
      code: 'CSAM3',
      description: 'Action description',
      sheetId: 'SD1234',
      parcelId: '5678',
      quantity: 4,
      unit: 'ha',
      annualPaymentPence: 20000
    },
    3: {
      code: 'SCR2',
      description: 'Action description',
      sheetId: 'CD9999',
      parcelId: '1111',
      quantity: 1,
      unit: 'ha',
      annualPaymentPence: 300
    }
  }
}

const paymentResult = { payment, paymentTotal: '£1,234.00', errorMessage: undefined }

function buildController(config = { redirects: { next: '/summary', addAnotherLandParcel: '/select-land-parcel' } }) {
  const pageDef = { path: '/confirm-land-and-actions' }
  const model = {
    def: { metadata: { tasklist: {}, pageConfig: { '/confirm-land-and-actions': config } } },
    getSection: vi.fn()
  }
  const controller = new ConfirmLandAndActionsPageController(model, pageDef)
  controller.setState = vi.fn().mockResolvedValue(true)
  controller.proceed = vi.fn().mockReturnValue('redirected')
  controller.getViewModel = vi.fn().mockReturnValue({ pageTitle: 'Your land and actions' })
  return controller
}

describe('ConfirmLandAndActionsPageController', () => {
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    mockRequest = {
      query: {},
      payload: {},
      auth: { isAuthenticated: true, credentials: { token: 'defra-id-token', sbi: '106284736' } }
    }
    mockContext = { state: { landParcels } }
    mockH = { view: vi.fn().mockReturnValue('rendered view') }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('config resolution', () => {
    test('throws SystemError with invalid_config when next is missing', () => {
      expect(() => buildController({ redirects: { addAnotherLandParcel: '/select-land-parcel' } })).toThrow(SystemError)
    })

    test('throws SystemError with invalid_config when addAnotherLandParcel is missing', () => {
      try {
        buildController({ redirects: { next: '/summary' } })
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(SystemError)
        expect(err.details.source).toBe('ConfirmLandAndActionsPageController')
        expect(err.details.reason).toBe('invalid_config')
      }
    })
  })

  describe('GET', () => {
    test('calls the calculate service once and renders API-derived amounts', async () => {
      calculateLandActionsPayment.mockResolvedValueOnce(paymentResult)
      const controller = buildController()

      const result = await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(calculateLandActionsPayment).toHaveBeenCalledTimes(1)
      expect(calculateLandActionsPayment).toHaveBeenCalledWith(mockContext.state, {
        defraIdToken: 'defra-id-token',
        sbi: '106284736'
      })

      const model = mockH.view.mock.calls[0][1]
      expect(mockH.view.mock.calls[0][0]).toBe('confirm-land-and-actions')
      expect(model.hasCalculationError).toBe(false)
      expect(model.parcels[0].actions.map((a) => a.yearlyPayment)).toEqual(['£100.00', '£200.00'])
      expect(model.parcels[1].actions.map((a) => a.yearlyPayment)).toEqual(['£3.00'])
      expect(model.parcels[0].yearlyPayment).toBe('£300.00')
      expect(model.parcels[1].yearlyPayment).toBe('£3.00')
      expect(model.applicationYearlyPayment).toBe('£1,234.00')
      expect(result).toBe('rendered view')
    })

    test('persists raw payment, totalPence and totalPayment only after validation', async () => {
      calculateLandActionsPayment.mockResolvedValueOnce(paymentResult)
      const controller = buildController()

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledTimes(1)
      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        landParcels,
        payment,
        totalPence: 123400,
        totalPayment: '£1,234.00'
      })
    })

    test('clears prior payment data and renders error when service fails', async () => {
      calculateLandActionsPayment.mockRejectedValueOnce(new Error('boom'))
      const controller = buildController()
      mockContext.state = { landParcels, payment: { annualTotalPence: 999 }, totalPence: 999, totalPayment: '£9.99' }

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, { landParcels })
      const model = mockH.view.mock.calls[0][1]
      expect(model.hasCalculationError).toBe(true)
      expect(model.errors).toEqual([
        { text: 'Unable to get payment information, please try again later or contact the Rural Payments Agency.' }
      ])
      expect(model.parcels).toBeUndefined()
      expect(model.applicationYearlyPayment).toBeUndefined()
    })

    test('clears prior payment data and renders error when model validation fails', async () => {
      // Response omits CD9999-1111 selected in state -> validation fails.
      const badPayment = {
        annualTotalPence: 30000,
        parcelItems: { 1: payment.parcelItems[1], 2: payment.parcelItems[2] }
      }
      calculateLandActionsPayment.mockResolvedValueOnce({ payment: badPayment, paymentTotal: '£300.00' })
      const controller = buildController()
      mockContext.state = { landParcels, payment: { annualTotalPence: 999 }, totalPence: 999, totalPayment: '£9.99' }

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, { landParcels })
      const model = mockH.view.mock.calls[0][1]
      expect(model.hasCalculationError).toBe(true)
      expect(model.parcels).toBeUndefined()
    })
  })

  describe('POST', () => {
    test('continue proceeds to configured next', async () => {
      const controller = buildController()
      mockRequest.payload = { action: 'continue' }

      await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/summary')
      expect(calculateLandActionsPayment).not.toHaveBeenCalled()
    })

    test('addAnotherLandParcel proceeds to configured addAnotherLandParcel', async () => {
      const controller = buildController()
      mockRequest.payload = { action: 'add-another' }

      await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/select-land-parcel')
    })

    test('missing or unknown action defaults to next', async () => {
      const controller = buildController()

      mockRequest.payload = {}
      await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)
      expect(controller.proceed).toHaveBeenLastCalledWith(mockRequest, mockH, '/summary')

      mockRequest.payload = { action: 'somethingElse' }
      await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)
      expect(controller.proceed).toHaveBeenLastCalledWith(mockRequest, mockH, '/summary')
    })

    test('POST does not recalculate or mutate payment state', async () => {
      const controller = buildController()
      mockRequest.payload = { action: 'continue' }

      await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).not.toHaveBeenCalled()
    })
  })
})
