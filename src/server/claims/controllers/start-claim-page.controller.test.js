import { vi } from 'vitest'
import StartClaimPageController from './start-claim-page.controller.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { resolveStrategy } from '~/src/server/payment/resolve-strategy.js'

vi.mock('~/src/server/payment/resolve-strategy.js', () => ({
  resolveStrategy: vi.fn()
}))

describe('StartClaimPageController', () => {
  let mockRequest
  let mockContext
  let mockResponseToolkit
  let strategyCalculatePayment

  const buildModel = (pageConfig = {}) => ({
    def: {
      metadata: {
        pageConfig: {
          '/claim': pageConfig
        }
      }
    },
    getSection: vi.fn()
  })

  const buildController = (pageConfig, pageDef = { title: 'Review your WMP claim', path: '/claim' }) =>
    new StartClaimPageController(buildModel(pageConfig), pageDef)

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Review your WMP claim',
      components: [
        {
          type: 'Html',
          model: {
            content:
              '<p>Total eligible area {{ totalEligibleArea }} {{ unit }}, total claim amount {{ (totalClaimAmountPence / 100) | formatCurrency }}</p>'
          }
        }
      ]
    })

    mockRequest = { method: 'GET' }
    mockContext = { state: {} }
    mockResponseToolkit = {
      view: vi.fn().mockReturnValue('rendered'),
      redirect: vi.fn()
    }

    strategyCalculatePayment = vi.fn().mockResolvedValue({ payment: {}, totalPence: 0, totalPayment: '£0.00' })
    vi.mocked(resolveStrategy).mockReset()
    vi.mocked(resolveStrategy).mockReturnValue({ calculatePayment: strategyCalculatePayment })
  })

  describe('fetchClaimData', () => {
    it('should return stubbed values for the configured data items', async () => {
      const controller = buildController({
        dataSources: [{ name: 'claims', items: ['totalEligibleArea', 'unit', 'totalClaimAmountPence'] }]
      })

      const data = await controller.fetchClaimData(mockRequest, mockContext)

      expect(data).toEqual({
        totalEligibleArea: 24.95,
        unit: 'ha',
        totalClaimAmountPence: 150000
      })
    })

    it('should return an empty object when no data sources are configured', async () => {
      const controller = buildController({})

      const data = await controller.fetchClaimData(mockRequest, mockContext)

      expect(data).toEqual({})
    })

    it('overrides totalClaimAmountPence with the payment strategy result when a paymentStrategy is configured', async () => {
      strategyCalculatePayment.mockResolvedValueOnce({ payment: {}, totalPence: 425000, totalPayment: '£4,250.00' })

      const controller = buildController({
        dataSources: [{ name: 'claims', items: ['totalEligibleArea', 'unit', 'totalClaimAmountPence'] }],
        paymentStrategy: 'woodland-claim'
      })

      const request = {
        method: 'GET',
        auth: { credentials: { token: 'defra-id-token', sbi: '123456789', crn: '1234567890' } }
      }
      const context = { state: { $$__referenceNumber: 'WMP-A1B2-C3D4' } }

      const data = await controller.fetchClaimData(request, context)

      expect(data).toEqual({
        totalEligibleArea: 24.95,
        unit: 'ha',
        totalClaimAmountPence: 425000
      })
    })
  })

  describe('makeGetRouteHandler', () => {
    it('should render the start-claim view with dynamic values injected into Html components', async () => {
      const controller = buildController({
        dataSources: [{ name: 'claims', items: ['totalEligibleArea', 'unit', 'totalClaimAmountPence'] }]
      })

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockResponseToolkit)

      expect(result).toBe('rendered')
      expect(mockResponseToolkit.view).toHaveBeenCalledTimes(1)

      const [viewName, viewModel] = mockResponseToolkit.view.mock.calls[0]
      expect(viewName).toBe('start-claim')
      expect(viewModel.totalEligibleArea).toBe(24.95)
      expect(viewModel.unit).toBe('ha')
      expect(viewModel.totalClaimAmountPence).toBe(150000)
      expect(viewModel.components[0].model.content).toBe(
        '<p>Total eligible area 24.95 ha, total claim amount £1,500.00</p>'
      )
    })

    it('should calculate the claim payment and inject the returned amount into the view', async () => {
      strategyCalculatePayment.mockResolvedValueOnce({ payment: {}, totalPence: 425000, totalPayment: '£4,250.00' })

      const controller = buildController({
        dataSources: [{ name: 'claims', items: ['totalEligibleArea', 'unit', 'totalClaimAmountPence'] }],
        paymentStrategy: 'woodland-claim'
      })
      controller.setState = vi.fn().mockResolvedValue(undefined)

      const request = {
        method: 'GET',
        auth: { credentials: { token: 'defra-id-token', sbi: '123456789', crn: '1234567890' } }
      }
      const context = { state: { $$__referenceNumber: 'WMP-A1B2-C3D4' } }

      const handler = controller.makeGetRouteHandler()
      await handler(request, context, mockResponseToolkit)

      expect(resolveStrategy).toHaveBeenCalledWith('woodland-claim')
      expect(strategyCalculatePayment).toHaveBeenCalledWith(
        {
          totalAreaHa: 24.95,
          applicationId: 'WMP-A1B2-C3D4',
          sbi: '123456789',
          crn: '1234567890'
        },
        { defraIdToken: 'defra-id-token', sbi: '123456789' }
      )

      const [, viewModel] = mockResponseToolkit.view.mock.calls[0]
      expect(viewModel.totalClaimAmountPence).toBe(425000)
      expect(viewModel.components[0].model.content).toBe(
        '<p>Total eligible area 24.95 ha, total claim amount £4,250.00</p>'
      )
    })

    it('should map an area unit abbreviation to a human-readable name via formatAreaUnit', async () => {
      QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
        components: [
          {
            type: 'Html',
            model: {
              content: '<p>Total eligible area {{ totalEligibleArea }} {{ unit | formatAreaUnit }}</p>'
            }
          }
        ]
      })

      const controller = buildController({
        dataSources: [{ name: 'claims', items: ['totalEligibleArea', 'unit'] }]
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockResponseToolkit)

      const [, viewModel] = mockResponseToolkit.view.mock.calls[0]
      expect(viewModel.components[0].model.content).toBe('<p>Total eligible area 24.95 hectares</p>')
    })

    it('should map a linear unit abbreviation to a human-readable name via formatLinearUnit', async () => {
      QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
        components: [
          {
            type: 'Html',
            model: {
              content: '<p>{{ "km" | formatLinearUnit }}</p>'
            }
          }
        ]
      })

      const controller = buildController({
        dataSources: [{ name: 'claims', items: ['totalEligibleArea', 'unit'] }]
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockResponseToolkit)

      const [, viewModel] = mockResponseToolkit.view.mock.calls[0]
      expect(viewModel.components[0].model.content).toBe('<p>kilometres</p>')
    })

    it('should leave non-Html components untouched', async () => {
      QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
        components: [{ type: 'TextField', model: { content: '{{ totalEligibleArea }}' } }]
      })

      const controller = buildController({
        dataSources: [{ name: 'claims', items: ['totalEligibleArea'] }]
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockResponseToolkit)

      const [, viewModel] = mockResponseToolkit.view.mock.calls[0]
      expect(viewModel.components[0].model.content).toBe('{{ totalEligibleArea }}')
    })
  })

  describe('calculateClaimPayment', () => {
    it('resolves the configured strategy and calls it with the payment context and user context', async () => {
      strategyCalculatePayment.mockResolvedValueOnce({ payment: {}, totalPence: 425000, totalPayment: '£4,250.00' })

      const controller = buildController({
        dataSources: [{ name: 'claims', items: ['totalEligibleArea', 'unit', 'totalClaimAmountPence'] }],
        paymentStrategy: 'woodland-claim'
      })

      const request = {
        method: 'GET',
        auth: { credentials: { token: 'defra-id-token', sbi: '123456789', crn: '1234567890' } }
      }
      const context = { state: { $$__referenceNumber: 'WMP-A1B2-C3D4' } }
      const gasData = { totalEligibleArea: 24.95, unit: 'ha', totalClaimAmountPence: 150000 }

      const result = await controller.calculateClaimPayment(request, context, gasData)

      expect(resolveStrategy).toHaveBeenCalledWith('woodland-claim')
      expect(strategyCalculatePayment).toHaveBeenCalledWith(
        {
          totalAreaHa: 24.95,
          applicationId: 'WMP-A1B2-C3D4',
          sbi: '123456789',
          crn: '1234567890'
        },
        { defraIdToken: 'defra-id-token', sbi: '123456789' }
      )
      expect(result).toEqual({ payment: {}, totalPence: 425000, totalPayment: '£4,250.00' })
    })

    it('returns undefined and skips the strategy when no paymentStrategy is configured', async () => {
      const controller = buildController({
        dataSources: [{ name: 'claims', items: ['totalEligibleArea'] }]
      })
      const request = {
        method: 'GET',
        auth: { credentials: { token: 'defra-id-token', sbi: '123456789' } }
      }
      const gasData = { totalEligibleArea: 24.95 }

      const result = await controller.calculateClaimPayment(
        request,
        { state: { $$__referenceNumber: 'WMP-A1B2-C3D4' } },
        gasData
      )

      expect(resolveStrategy).not.toHaveBeenCalled()
      expect(strategyCalculatePayment).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('returns undefined when there is no application reference number in state', async () => {
      const controller = buildController({ paymentStrategy: 'woodland-claim' })
      const request = {
        method: 'GET',
        auth: { credentials: { token: 'defra-id-token', sbi: '123456789' } }
      }
      const gasData = { totalEligibleArea: 24.95 }

      const result = await controller.calculateClaimPayment(request, { state: {} }, gasData)

      expect(strategyCalculatePayment).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('returns undefined when there is no total eligible area', async () => {
      const controller = buildController({ paymentStrategy: 'woodland-claim' })
      const request = {
        method: 'GET',
        auth: { credentials: { token: 'defra-id-token', sbi: '123456789' } }
      }
      const gasData = {}

      const result = await controller.calculateClaimPayment(
        request,
        { state: { $$__referenceNumber: 'WMP-A1B2-C3D4' } },
        gasData
      )

      expect(strategyCalculatePayment).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })
  })

  describe('persistCurrentClaim', () => {
    it('creates and persists a current claim with a derived claim number', async () => {
      const controller = buildController({
        dataSources: [{ name: 'claims', items: ['totalEligibleArea', 'unit', 'totalClaimAmountPence'] }]
      })
      controller.setState = vi.fn().mockResolvedValue(undefined)

      const context = { state: { $$__referenceNumber: 'WMP-A1B2-C3D4' } }

      await controller.persistCurrentClaim(mockRequest, context, {
        totalEligibleArea: 24.95,
        unit: 'ha',
        totalClaimAmountPence: 150000
      })

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          $$__referenceNumber: 'WMP-A1B2-C3D4',
          claims: [
            {
              claimNumber: 'WMP-A1B2-C3D4-C0001',
              status: 'IN_PROGRESS',
              totalEligibleArea: 24.95,
              unit: 'ha',
              totalClaimAmountPence: 150000
            }
          ]
        })
      )
    })

    it('does nothing when there is no application reference number in state', async () => {
      const controller = buildController({})
      controller.setState = vi.fn()

      await controller.persistCurrentClaim(mockRequest, { state: {} }, {})

      expect(controller.setState).not.toHaveBeenCalled()
    })
  })

  describe('makePostRouteHandler', () => {
    it('should proceed to the next path', async () => {
      const controller = buildController({})
      controller.proceed = vi.fn().mockReturnValue('nextPath')
      controller.getNextPath = vi.fn().mockReturnValue('/claim/next')

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockResponseToolkit)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockResponseToolkit, '/claim/next')
      expect(result).toBe('nextPath')
    })
  })
})
