import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import ConfirmLandAndActionsPageController from './confirm-land-and-actions-page.controller.js'
import { calculateLandActionsPayment } from '~/src/server/land-grants/services/land-grants.service.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  calculateLandActionsPayment: vi.fn()
}))

vi.mock('~/src/server/common/helpers/logging/upstream-error.js', () => ({
  logUpstreamError: vi.fn()
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

// The shared test mock has no `path` or `getHref`, so define them here instead of
// changing the global test setup. `getHref` copies `PageController.getHref`:
// prefix the base path and collapse repeated slashes.
const stubEngineHrefs = (controller, path) => {
  controller.path = path
  controller.getHref = (target) => `/test-grant/${target ?? ''}`.replace(/\/{2,}/g, '/')
}

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
  stubEngineHrefs(controller, pageDef.path)
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
      yar: { get: vi.fn(), clear: vi.fn() },
      auth: { isAuthenticated: true, credentials: { token: 'defra-id-token', sbi: '106284736' } }
    }
    mockContext = { state: { landParcels, payment } }
    mockH = { view: vi.fn().mockReturnValue('rendered view'), redirect: vi.fn().mockReturnValue('redirected away') }
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
      mockContext.state = { landParcels }

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledTimes(1)
      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        landParcels,
        payment,
        totalPence: 123400,
        totalPayment: '£1,234.00'
      })
    })

    test('renders agreement-level items alongside the parcel cards', async () => {
      const withAgreementLevel = {
        ...payment,
        agreementLevelItems: { 1: { code: 'CMOR1', description: 'Assess moorland', annualPaymentPence: 27200 } }
      }
      calculateLandActionsPayment.mockResolvedValueOnce({ payment: withAgreementLevel, paymentTotal: '£1,234.00' })
      const controller = buildController()

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      const model = mockH.view.mock.calls[0][1]
      expect(model.hasCalculationError).toBe(false)
      expect(model.additionalYearlyPayments).toEqual([{ action: 'Assess moorland (CMOR1)', yearlyPayment: '£272.00' }])
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

    test('reports a genuine service failure as an upstream error', async () => {
      calculateLandActionsPayment.mockRejectedValueOnce(new Error('boom'))
      const controller = buildController()

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(logUpstreamError).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'Land grants API',
          service: 'land-grants',
          errorMessage: expect.stringContaining('for sbi 106284736')
        }),
        mockRequest
      )
    })

    test('does not report a malformed response as an upstream API outage', async () => {
      calculateLandActionsPayment.mockResolvedValueOnce({
        payment: { annualTotalPence: -1, parcelItems: {} },
        paymentTotal: '£0.00'
      })
      const controller = buildController()
      mockContext.state = { landParcels, payment: { annualTotalPence: 999 }, totalPence: 999, totalPayment: '£9.99' }

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(logUpstreamError).not.toHaveBeenCalled()
      expect(controller.setState).toHaveBeenCalledWith(mockRequest, { landParcels })
      const model = mockH.view.mock.calls[0][1]
      expect(model.hasCalculationError).toBe(true)
      expect(model.parcels).toBeUndefined()
    })

    test('offers a way out of the error state instead of dead-ending', async () => {
      calculateLandActionsPayment.mockRejectedValueOnce(new Error('boom'))
      const controller = buildController()

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      const model = mockH.view.mock.calls[0][1]
      expect(model.retryHref).toBe('/test-grant/confirm-land-and-actions')
      expect(model.selectLandParcelHref).toBe('/test-grant/select-land-parcel')
    })

    describe('with no land parcels left', () => {
      test('renders the empty state without pricing an empty selection', async () => {
        const controller = buildController()
        mockContext.state = { landParcels: {}, payment, totalPence: 999, totalPayment: '£9.99' }

        await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

        expect(calculateLandActionsPayment).not.toHaveBeenCalled()
        const model = mockH.view.mock.calls[0][1]
        expect(model.hasNoLandParcels).toBe(true)
        expect(model.hasCalculationError).toBe(false)
        expect(model.selectLandParcelHref).toBe('/test-grant/select-land-parcel')
      })

      test('drops the payment left over from the removed parcels', async () => {
        const controller = buildController()
        mockContext.state = { landParcels: {}, payment, totalPence: 999, totalPayment: '£9.99' }

        await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

        expect(controller.setState).toHaveBeenCalledWith(mockRequest, { landParcels: {} })
      })

      test('announces the removal that emptied the application', async () => {
        mockRequest.yar.get.mockReturnValueOnce('Far Meadow')
        const controller = buildController()
        mockContext.state = { landParcels: {} }

        await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

        expect(mockRequest.yar.clear).toHaveBeenCalledWith('landParcelRemovalSuccess')
        expect(mockH.view.mock.calls[0][1].landParcelRemovalSuccessMessage).toBe(
          'Far Meadow and its actions have been removed.'
        )
      })

      test('treats missing landParcels state the same as an empty selection', async () => {
        const controller = buildController()
        mockContext.state = {}

        await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

        expect(calculateLandActionsPayment).not.toHaveBeenCalled()
        expect(mockH.view.mock.calls[0][1].hasNoLandParcels).toBe(true)
      })
    })
  })

  describe('land parcel removal notification', () => {
    test('announces the removal once and clears the marker', async () => {
      calculateLandActionsPayment.mockResolvedValueOnce(paymentResult)
      mockRequest.yar.get.mockReturnValueOnce('SD1234 5678')
      const controller = buildController()

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(mockRequest.yar.get).toHaveBeenCalledWith('landParcelRemovalSuccess')
      expect(mockRequest.yar.clear).toHaveBeenCalledTimes(1)
      expect(mockRequest.yar.clear).toHaveBeenCalledWith('landParcelRemovalSuccess')
      expect(mockH.view.mock.calls[0][1].landParcelRemovalSuccessMessage).toBe(
        'SD1234 5678 and its actions have been removed.'
      )
    })

    test('still announces the removal when recalculating the remaining payment fails', async () => {
      calculateLandActionsPayment.mockRejectedValueOnce(new Error('boom'))
      mockRequest.yar.get.mockReturnValueOnce('SD1234 5678')
      const controller = buildController()

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      const model = mockH.view.mock.calls[0][1]
      expect(model.hasCalculationError).toBe(true)
      expect(model.landParcelRemovalSuccessMessage).toBe('SD1234 5678 and its actions have been removed.')
    })

    test('a direct GET with no marker carries no message', async () => {
      calculateLandActionsPayment.mockResolvedValueOnce(paymentResult)
      const controller = buildController()

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(mockRequest.yar.clear).not.toHaveBeenCalled()
      expect(mockH.view.mock.calls[0][1].landParcelRemovalSuccessMessage).toBeUndefined()
    })

    test('consumes a blank stored value without rendering', async () => {
      calculateLandActionsPayment.mockResolvedValueOnce(paymentResult)
      mockRequest.yar.get.mockReturnValueOnce('   ')
      const controller = buildController()

      await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(mockRequest.yar.clear).toHaveBeenCalledWith('landParcelRemovalSuccess')
      expect(mockH.view.mock.calls[0][1].landParcelRemovalSuccessMessage).toBeUndefined()
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

    test('add-another redirects straight to the configured parcel picker', async () => {
      const controller = buildController()
      mockRequest.payload = { action: 'add-another' }

      const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.proceed).not.toHaveBeenCalled()
      expect(mockH.redirect).toHaveBeenCalledWith('/test-grant/select-land-parcel')
      expect(result).toBe('redirected away')
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

    test('refuses to advance when the calculation left no payment in state', async () => {
      const controller = buildController()
      mockContext.state = { landParcels }
      mockRequest.payload = { action: 'continue' }

      const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.proceed).not.toHaveBeenCalled()
      expect(mockH.redirect).toHaveBeenCalledWith('/test-grant/confirm-land-and-actions')
      expect(result).toBe('redirected away')
    })
  })
})
