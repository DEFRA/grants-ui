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

  beforeEach(() => {
    jest.clearAllMocks()

    mockModel = { name: 'test-model' }
    mockPageDef = { title: 'Test Page' }

    mockRequest = {
      params: {},
      query: {},
      payload: {}
    }

    mockContext = {
      state: {
        landParcels: {
          'parcel-1': {
            actionsObj: {
              'action-1': {
                description: 'Test Action 1',
                value: '10',
                unit: 'hectares'
              },
              'action-2': {
                description: 'Test Action 2',
                value: '5',
                unit: 'hectares'
              }
            }
          },
          'parcel-2': {
            actionsObj: {
              'action-3': {
                description: 'Test Action 3',
                value: '15',
                unit: 'hectares'
              }
            }
          }
        }
      }
    }

    mockH = {
      view: jest.fn().mockReturnValue('mocked-view-response')
    }

    controller = new CheckAnswersPageController(mockModel, mockPageDef)
    controller.getNextPath = jest.fn().mockReturnValue('/next-path')
    controller.proceed = jest.fn().mockReturnValue('redirected')
  })

  describe('constructor', () => {
    it('should create instance and set viewName to check-your-answers', () => {
      expect(controller.viewName).toBe('check-your-answers')
    })
  })

  describe('getSummaryViewModel', () => {
    beforeEach(() => {
      sbiStore.get.mockReturnValue('123456789')

      calculateGrantPayment.mockResolvedValue({
        paymentTotal: '£1,500.00'
      })
    })

    it('should get SBI from sbiStore', async () => {
      await controller.getSummaryViewModel(mockRequest, mockContext)

      expect(sbiStore.get).toHaveBeenCalledWith('sbi')
    })

    it('should calculate grant payment with land parcels', async () => {
      await controller.getSummaryViewModel(mockRequest, mockContext)

      expect(calculateGrantPayment).toHaveBeenCalledWith({
        landParcels: mockContext.state.landParcels
      })
    })

    it('should add SBI and payment rows at the beginning', async () => {
      const result = await controller.getSummaryViewModel(
        mockRequest,
        mockContext
      )

      const rows = result.checkAnswers[0].summaryList.rows

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
    })

    it('should add total actions row with correct count', async () => {
      const result = await controller.getSummaryViewModel(
        mockRequest,
        mockContext
      )

      const rows = result.checkAnswers[0].summaryList.rows
      const totalActionsRow = rows.find(
        (row) => row.key.text === 'Total number of actions applied for'
      )

      expect(totalActionsRow).toEqual({
        key: { text: 'Total number of actions applied for' },
        value: { text: 3 }, // 2 actions in parcel-1 + 1 action in parcel-2
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
    })

    it('should add parcel based actions row', async () => {
      const result = await controller.getSummaryViewModel(
        mockRequest,
        mockContext
      )

      const rows = result.checkAnswers[0].summaryList.rows
      const parcelActionsRow = rows.find(
        (row) => row.key.text === 'Parcel based actions'
      )

      expect(parcelActionsRow).toEqual({
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
    })

    it('should add individual parcel action rows', async () => {
      const result = await controller.getSummaryViewModel(
        mockRequest,
        mockContext
      )

      const rows = result.checkAnswers[0].summaryList.rows

      const parcel1Action1 = rows.find(
        (row) =>
          row.key.text === 'parcel-1' &&
          row.value.html.includes('Test Action 1')
      )
      expect(parcel1Action1).toEqual({
        classes: 'govuk-summary-list__parcels-row',
        key: { text: 'parcel-1' },
        value: {
          html: 'Test Action 1<br/>Applied area: 10 hectares'
        }
      })

      const parcel1Action2 = rows.find(
        (row) =>
          row.key.text === 'parcel-1' &&
          row.value.html.includes('Test Action 2')
      )
      expect(parcel1Action2).toEqual({
        classes: 'govuk-summary-list__parcels-row',
        key: { text: 'parcel-1' },
        value: {
          html: 'Test Action 2<br/>Applied area: 5 hectares'
        }
      })

      const parcel2Action = rows.find((row) => row.key.text === 'parcel-2')
      expect(parcel2Action).toEqual({
        classes: 'govuk-summary-list__parcels-row',
        key: { text: 'parcel-2' },
        value: {
          html: 'Test Action 3<br/>Applied area: 15 hectares'
        }
      })
    })

    it('should handle null payment response', async () => {
      calculateGrantPayment.mockResolvedValue(null)

      const result = await controller.getSummaryViewModel(
        mockRequest,
        mockContext
      )

      const rows = result.checkAnswers[0].summaryList.rows
      const paymentRow = rows.find(
        (row) =>
          row.key.text ===
          'Indicative annual payment (excluding management payment)'
      )

      expect(paymentRow.value.text).toBeUndefined()
    })

    it('should handle empty land parcels', async () => {
      mockContext.state.landParcels = {}

      const result = await controller.getSummaryViewModel(
        mockRequest,
        mockContext
      )

      const rows = result.checkAnswers[0].summaryList.rows
      const totalActionsRow = rows.find(
        (row) => row.key.text === 'Total number of actions applied for'
      )

      expect(totalActionsRow.value.text).toBe(0)
    })
  })

  describe('makeGetRouteHandler', () => {
    it('should return a function', () => {
      const handler = controller.makeGetRouteHandler()

      expect(typeof handler).toBe('function')
    })

    it('should call getSummaryViewModel and return view', async () => {
      const mockViewModel = { test: 'data' }
      controller.getSummaryViewModel = jest
        .fn()
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

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error')
      controller.getSummaryViewModel = jest.fn().mockRejectedValue(error)

      const handler = controller.makeGetRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        'Test error'
      )
    })
  })

  describe('makePostRouteHandler', () => {
    test('should just proceed', async () => {
      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/next-path'
      )

      expect(result).toBe('redirected')
    })
  })

  describe('edge cases', () => {
    it('should handle missing actionsObj in land parcels', async () => {
      mockContext.state.landParcels = {
        'parcel-1': {}, // Missing actionsObj
        'parcel-2': {
          actionsObj: {
            'action-1': {
              description: 'Test Action',
              value: '10',
              unit: 'hectares'
            }
          }
        }
      }

      const result = await controller.getSummaryViewModel(
        mockRequest,
        mockContext
      )

      const rows = result.checkAnswers[0].summaryList.rows
      const totalActionsRow = rows.find(
        (row) => row.key.text === 'Total number of actions applied for'
      )

      expect(totalActionsRow.value.text).toBe(1) // Only count actions from parcel-2
    })

    it('should handle missing state in context', async () => {
      mockContext.state = undefined

      await expect(
        controller.getSummaryViewModel(mockRequest, mockContext)
      ).rejects.toThrow()
    })

    it('should handle missing landParcels in state', async () => {
      mockContext.state.landParcels = undefined

      await expect(
        controller.getSummaryViewModel(mockRequest, mockContext)
      ).rejects.toThrow()
    })
  })
})
