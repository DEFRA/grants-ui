import { sbiStore } from '../../sbi/state.js'
import { calculateGrantPayment } from '../services/land-grants.service.js'
import CheckAnswersPageController from './check-answers-page.controller.js'

jest.mock('../../sbi/state.js', () => ({
  sbiStore: {
    get: jest.fn()
  }
}))
jest.mock('../services/land-grants.service.js', () => ({
  calculateGrantPayment: jest.fn()
}))

describe('CheckAnswersPageController', () => {
  let controller
  let mockModel
  let mockPageDef
  let mockRequest
  let mockContext
  let mockH

  // Test data factories
  const createMockAction = (
    id,
    description = 'Test Action',
    value = '10',
    unit = 'hectares'
  ) => ({
    [id]: {
      description,
      value,
      unit
    }
  })

  const createMockParcel = (actions) => ({
    actionsObj: actions
  })

  const createMockLandParcels = () => ({
    'parcel-1': createMockParcel({
      ...createMockAction('action-1', 'Test Action 1'),
      ...createMockAction('action-2', 'Test Action 2', '5')
    }),
    'parcel-2': createMockParcel({
      ...createMockAction('action-3', 'Test Action 3', '15')
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()

    mockModel = { name: 'test-model' }
    mockPageDef = { title: 'Test Page' }

    mockRequest = {
      params: {},
      query: {},
      payload: {},
      logger: {
        error: jest.fn()
      }
    }

    mockContext = {
      state: {
        landParcels: createMockLandParcels()
      }
    }

    mockH = {
      view: jest.fn().mockReturnValue('mocked-view-response')
    }

    sbiStore.get.mockReturnValue('123456789')
    calculateGrantPayment.mockResolvedValue({
      paymentTotal: '£1,500.00'
    })

    controller = new CheckAnswersPageController(mockModel, mockPageDef)
    controller.getNextPath = jest.fn().mockReturnValue('/next-path')
    controller.proceed = jest.fn().mockReturnValue('redirected')
  })

  afterEach(() => {
    mockRequest.logger.error.mockClear()
  })

  describe('constructor', () => {
    it('should create instance and set viewName to check-your-answers', () => {
      expect(controller.viewName).toBe('check-your-answers')
    })
  })

  describe('validateContext', () => {
    it('should not throw when context is valid', () => {
      expect(() => controller.validateContext(mockContext)).not.toThrow()
    })

    it('should throw when context is undefined', () => {
      expect(() => controller.validateContext(undefined)).toThrow(
        'Land parcels data is missing from context'
      )
    })

    it('should throw when state is missing', () => {
      expect(() => controller.validateContext({})).toThrow(
        'Land parcels data is missing from context'
      )
    })

    it('should throw when landParcels is missing', () => {
      expect(() => controller.validateContext({ state: {} })).toThrow(
        'Land parcels data is missing from context'
      )
    })
  })

  describe('calculateTotalActions', () => {
    it('should calculate total actions correctly', () => {
      const landParcels = createMockLandParcels()
      const total = controller.calculateTotalActions(landParcels)

      expect(total).toBe(3) // 2 + 1
    })

    it('should handle empty land parcels', () => {
      const total = controller.calculateTotalActions({})

      expect(total).toBe(0)
    })

    it('should handle parcels without actionsObj', () => {
      const landParcels = {
        'parcel-1': {},
        'parcel-2': createMockParcel(createMockAction('action-1'))
      }

      const total = controller.calculateTotalActions(landParcels)

      expect(total).toBe(1)
    })

    it('should handle parcels with null actionsObj', () => {
      const landParcels = {
        'parcel-1': { actionsObj: null },
        'parcel-2': createMockParcel(createMockAction('action-1'))
      }

      const total = controller.calculateTotalActions(landParcels)

      expect(total).toBe(1)
    })

    it('should handle parcels with undefined actionsObj', () => {
      const landParcels = {
        'parcel-1': { actionsObj: undefined },
        'parcel-2': createMockParcel(createMockAction('action-1'))
      }

      const total = controller.calculateTotalActions(landParcels)

      expect(total).toBe(1)
    })
  })

  describe('createParcelActionRows', () => {
    it('should create correct parcel action rows', () => {
      const landParcels = createMockLandParcels()
      const rows = controller.createParcelActionRows(landParcels)

      expect(rows).toHaveLength(3)

      expect(rows[0]).toEqual(
        expect.objectContaining({
          key: expect.objectContaining({ text: 'parcel-1' }),
          value: {
            html: 'Test Action 1<br/>Applied area: 10 hectares'
          }
        })
      )

      expect(rows[1]).toEqual(
        expect.objectContaining({
          key: expect.objectContaining({ text: 'parcel-1' }),
          value: {
            html: 'Test Action 2<br/>Applied area: 5 hectares'
          }
        })
      )

      expect(rows[2]).toEqual(
        expect.objectContaining({
          key: expect.objectContaining({ text: 'parcel-2' }),
          value: {
            html: 'Test Action 3<br/>Applied area: 15 hectares'
          }
        })
      )
    })

    it('should skip parcels with no actions', () => {
      const landParcels = {
        'parcel-1': {},
        'parcel-2': createMockParcel(createMockAction('action-1'))
      }

      const rows = controller.createParcelActionRows(landParcels)

      expect(rows).toHaveLength(1)
      expect(rows[0].key.text).toBe('parcel-2')
    })

    it('should skip parcels with empty actionsObj', () => {
      const landParcels = {
        'parcel-1': { actionsObj: {} },
        'parcel-2': createMockParcel(createMockAction('action-1'))
      }

      const rows = controller.createParcelActionRows(landParcels)

      expect(rows).toHaveLength(1)
      expect(rows[0].key.text).toBe('parcel-2')
    })

    it('should handle empty land parcels', () => {
      const rows = controller.createParcelActionRows({})

      expect(rows).toHaveLength(0)
    })

    it('should handle parcels with missing action properties gracefully', () => {
      const landParcels = {
        'parcel-1': {
          actionsObj: {
            'action-1': {
              description: 'Test Action',
              value: '10',
              unit: 'hectares'
            },
            'action-2': {
              // Missing some properties should still populate rows
              description: 'Incomplete Action'
            }
          }
        }
      }

      const rows = controller.createParcelActionRows(landParcels)

      expect(rows).toHaveLength(2)
      expect(rows[1].value.html).toContain('Incomplete Action')
    })
  })

  describe('getBusinessData', () => {
    it('should get SBI data', () => {
      const businessData = controller.getBusinessData()

      expect(businessData).toEqual({
        sbi: '123456789'
      })

      expect(sbiStore.get).toHaveBeenCalledWith('sbi')
    })

    it('should handle missing SBI', () => {
      sbiStore.get.mockReturnValue(null)

      const businessData = controller.getBusinessData()

      expect(businessData).toEqual({
        sbi: null
      })
    })
  })

  describe('calculatePaymentData', () => {
    it('should calculate payment data', async () => {
      const landParcels = createMockLandParcels()
      const paymentData = await controller.calculatePaymentData(landParcels)

      expect(paymentData).toEqual({
        paymentTotal: '£1,500.00'
      })

      expect(calculateGrantPayment).toHaveBeenCalledWith({ landParcels })
    })

    it('should handle null payment response', async () => {
      calculateGrantPayment.mockResolvedValue(null)

      const landParcels = createMockLandParcels()
      const paymentData = await controller.calculatePaymentData(landParcels)

      expect(paymentData).toEqual({
        paymentTotal: undefined
      })
    })

    it('should fail if calculateGrantPayment errors', async () => {
      const error = new Error('Payment calculation failed')
      calculateGrantPayment.mockRejectedValue(error)

      const landParcels = createMockLandParcels()

      await expect(
        controller.calculatePaymentData(landParcels)
      ).rejects.toThrow('Payment calculation failed')
    })
  })

  describe('getViewRows', () => {
    beforeEach(() => {
      calculateGrantPayment.mockResolvedValue({
        paymentTotal: '£1,500.00'
      })
    })

    it('should create all required rows in correct order', async () => {
      const summaryList = { rows: ['base-row'] }
      const rows = await controller.getViewRows(summaryList, mockContext)

      expect(rows).toHaveLength(8) // SBI + payment + base + total actions + parcel based + 3 parcel actions

      expect(rows[0]).toEqual({
        key: { text: 'Single business identifier (SBI)' },
        value: { text: '123456789' }
      })

      expect(rows[1]).toEqual({
        key: {
          text: 'Indicative annual payment (excluding management payment)'
        },
        value: { text: '£1,500.00' }
      })

      expect(rows[2]).toBe('base-row')

      expect(rows[3]).toEqual({
        key: {
          text: 'Total number of actions applied for'
        },
        value: { text: 3 },
        actions: {
          items: [
            {
              href: '/find-funding-for-land-or-farms/select-land-parcel',
              text: 'Change',
              visuallyHiddenText: 'Actions'
            }
          ]
        }
      })

      expect(rows[4]).toEqual({
        key: { text: 'Parcel based actions' },
        actions: {
          items: [
            {
              href: '/find-funding-for-land-or-farms/select-land-parcel',
              text: 'Change',
              visuallyHiddenText: 'Actions'
            }
          ]
        }
      })

      expect(rows[5]).toEqual(
        expect.objectContaining({
          key: expect.objectContaining({ text: 'parcel-1' }),
          value: {
            html: 'Test Action 1<br/>Applied area: 10 hectares'
          }
        })
      )

      expect(rows[6]).toEqual(
        expect.objectContaining({
          key: expect.objectContaining({ text: 'parcel-1' }),
          value: {
            html: 'Test Action 2<br/>Applied area: 5 hectares'
          }
        })
      )

      expect(rows[7]).toEqual(
        expect.objectContaining({
          key: expect.objectContaining({ text: 'parcel-2' }),
          value: {
            html: 'Test Action 3<br/>Applied area: 15 hectares'
          }
        })
      )
    })

    it('should handle empty summaryList rows', async () => {
      const summaryList = {}
      const rows = await controller.getViewRows(summaryList, mockContext)

      expect(rows).toHaveLength(7) // SBI + payment + total actions + parcel based + 3 parcel actions (no base rows)
    })

    it('should calculate grant payment', async () => {
      const summaryList = { rows: [] }
      await controller.getViewRows(summaryList, mockContext)

      expect(calculateGrantPayment).toHaveBeenCalledWith({
        landParcels: mockContext.state.landParcels
      })
    })

    it('should handle context validation failure', async () => {
      const invalidContext = { state: {} }
      const summaryList = { rows: [] }

      await expect(
        controller.getViewRows(summaryList, invalidContext)
      ).rejects.toThrow('Land parcels data is missing from context')
    })

    it('should handle calculateGrantPayment failure', async () => {
      const error = new Error('Payment service unavailable')
      calculateGrantPayment.mockRejectedValue(error)

      const summaryList = { rows: [] }

      await expect(
        controller.getViewRows(summaryList, mockContext)
      ).rejects.toThrow('Payment service unavailable')
    })
  })

  describe('getSummaryViewModel', () => {
    let superGetSummaryViewModelSpy

    beforeEach(() => {
      // Mock parent class method
      superGetSummaryViewModelSpy = jest
        .spyOn(
          Object.getPrototypeOf(CheckAnswersPageController.prototype),
          'getSummaryViewModel'
        )
        .mockResolvedValue({
          checkAnswers: [
            {
              summaryList: {
                rows: []
              }
            }
          ]
        })
    })

    afterEach(() => {
      if (superGetSummaryViewModelSpy) {
        superGetSummaryViewModelSpy.mockRestore()
      }
    })

    it('should return enhanced view model with all rows', async () => {
      const result = await controller.getSummaryViewModel(
        mockRequest,
        mockContext
      )

      expect(result.checkAnswers).toHaveLength(1)

      const rows = result.checkAnswers[0].summaryList.rows

      const sbiRow = rows.find(
        (row) => row.key && row.key.text === 'Single business identifier (SBI)'
      )
      expect(sbiRow).toBeDefined()
      expect(sbiRow.value.text).toBe('123456789')
    })

    it('should return original view model when no checkAnswers', async () => {
      superGetSummaryViewModelSpy.mockResolvedValue({ checkAnswers: [] })

      const result = await controller.getSummaryViewModel(
        mockRequest,
        mockContext
      )

      expect(result).toEqual({ checkAnswers: [] })
    })

    it('should not mutate original view model', async () => {
      const originalViewModel = {
        checkAnswers: [
          {
            summaryList: {
              rows: ['original-row'],
              otherProperty: 'original-value'
            },
            otherCheckAnswerProperty: 'original'
          }
        ],
        otherProperty: 'original'
      }

      superGetSummaryViewModelSpy.mockResolvedValue(originalViewModel)

      const result = await controller.getSummaryViewModel(
        mockRequest,
        mockContext
      )

      expect(originalViewModel.checkAnswers[0].summaryList.rows).toEqual([
        'original-row'
      ])
      expect(originalViewModel.checkAnswers[0].summaryList.otherProperty).toBe(
        'original-value'
      )
      expect(originalViewModel.otherProperty).toBe('original')

      expect(result.checkAnswers[0].summaryList.rows).not.toEqual([
        'original-row'
      ])
      expect(result.checkAnswers[0].summaryList.otherProperty).toBe(
        'original-value'
      )
      expect(result.checkAnswers[0].otherCheckAnswerProperty).toBe('original')
      expect(result.otherProperty).toBe('original')
    })

    it('should handle getViewRows failure', async () => {
      mockContext.state = undefined

      await expect(
        controller.getSummaryViewModel(mockRequest, mockContext)
      ).rejects.toThrow('Land parcels data is missing from context')
    })
  })

  describe('makeGetRouteHandler', () => {
    it('should return a function', () => {
      const handler = controller.makeGetRouteHandler()
      expect(typeof handler).toBe('function')
    })

    it('should call getSummaryViewModel and return view', async () => {
      const mockViewModel = { test: 'data' }
      jest
        .spyOn(controller, 'getSummaryViewModel')
        .mockResolvedValue(mockViewModel)

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.getSummaryViewModel).toHaveBeenCalledWith(
        mockRequest,
        mockContext
      )
      expect(mockH.view).toHaveBeenCalledWith(
        'check-your-answers',
        mockViewModel
      )
      expect(result).toBe('mocked-view-response')
    })

    it('should log and re-throw errors', async () => {
      const error = new Error('Test error')
      jest.spyOn(controller, 'getSummaryViewModel').mockRejectedValue(error)

      const handler = controller.makeGetRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        'Test error'
      )
      expect(mockRequest.logger.error).toHaveBeenCalledWith({
        message: 'Error in CheckAnswersPageController GET handler',
        error
      })
    })
  })

  describe('makePostRouteHandler', () => {
    it('should proceed with next path', () => {
      const handler = controller.makePostRouteHandler()
      const result = handler(mockRequest, mockContext, mockH)

      expect(controller.getNextPath).toHaveBeenCalledWith(mockContext)
      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/next-path'
      )
      expect(result).toBe('redirected')
    })
  })
})
