import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import LandActionsCheckPageController from './land-actions-check-page.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')
jest.mock('~/src/server/land-grants/services/land-grants.service.js')

describe('LandActionsCheckPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const mockPaymentData = {
    agreementStartDate: '2025-10-01',
    agreementEndDate: '2028-10-01',
    frequency: 'Quarterly',
    agreementTotalPence: 96018,
    annualTotalPence: 32006,
    parcelItems: {
      1: {
        code: 'CMOR1',
        description: 'CMOR1: Assess moorland and produce a written record',
        version: 1,
        unit: 'ha',
        quantity: 4.53411078,
        rateInPence: 1060,
        annualPaymentPence: 4806,
        sheetId: 'SD6743',
        parcelId: '8083'
      },
      2: {
        code: 'CMOR1',
        description: 'CMOR1: Assess moorland and produce a written record',
        version: 1,
        unit: 'ha',
        quantity: 0,
        rateInPence: 1060,
        annualPaymentPence: 0,
        sheetId: 'SD6943',
        parcelId: '0085'
      }
    },
    agreementLevelItems: {
      1: {
        code: 'CMOR1',
        description: 'CMOR1: Assess moorland and produce a written record',
        version: 1,
        annualPaymentPence: 27200
      }
    }
  }

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Check selected land actions'
    })

    controller = new LandActionsCheckPageController()

    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }
    controller.setState = jest.fn().mockResolvedValue(true)
    controller.proceed = jest.fn().mockReturnValue('redirected')
    controller.getNextPath = jest.fn().mockReturnValue('/next-path')
    controller.parcelItems = [
      {
        parcelId: 'SD6743 8083',
        items: [
          [
            { text: 'CMOR1: Assess moorland and produce a written record' },
            { text: '4.53411078 ha' },
            { text: '£48.06' },
            { html: "<a class='govuk-link' href='confirm-delete-parcel' style='display: none'>Remove</a>" }
          ]
        ]
      }
    ]
    controller.additionalYearlyPayments = [
      {
        items: [
          [
            {
              text: 'One-off payment per agreement per year for CMOR1: Assess moorland and produce a written record'
            },
            { text: '£272.00' }
          ]
        ]
      }
    ]

    mockRequest = {
      payload: {
        actions: ['action1', 'action2']
      },
      logger: {
        error: jest.fn()
      }
    }

    mockContext = {
      state: {
        landParcel: 'sheet1-parcel1',
        payment: mockPaymentData
      }
    }

    mockH = {
      view: jest.fn().mockReturnValue('rendered view'),
      redirect: jest.fn().mockReturnValue('redirected')
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('land-actions-check')
  })

  describe('POST route handler', () => {
    test('should show error when addMoreActions is not provided and action is validate', async () => {
      mockRequest.payload = { action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        payment: mockPaymentData,
        parcelItems: [
          {
            parcelId: 'SD6743 8083',
            items: [
              [
                { text: 'CMOR1: Assess moorland and produce a written record' },
                { text: '4.53411078 ha' },
                { text: '£48.06' },
                { html: "<a class='govuk-link' href='confirm-delete-parcel' style='display: none'>Remove</a>" }
              ]
            ]
          }
        ],
        additionalYearlyPayments: [
          {
            items: [
              [
                {
                  text: 'One-off payment per agreement per year for CMOR1: Assess moorland and produce a written record'
                },
                { text: '£272.00' }
              ]
            ]
          }
        ],
        totalYearlyPayment: '£320.06',
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should show error when addMoreActions is null and action is validate', async () => {
      mockRequest.payload = { addMoreActions: null, action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        payment: mockPaymentData,
        parcelItems: [
          {
            parcelId: 'SD6743 8083',
            items: [
              [
                { text: 'CMOR1: Assess moorland and produce a written record' },
                { text: '4.53411078 ha' },
                { text: '£48.06' },
                { html: "<a class='govuk-link' href='confirm-delete-parcel' style='display: none'>Remove</a>" }
              ]
            ]
          }
        ],
        additionalYearlyPayments: [
          {
            items: [
              [
                {
                  text: 'One-off payment per agreement per year for CMOR1: Assess moorland and produce a written record'
                },
                { text: '£272.00' }
              ]
            ]
          }
        ],
        totalYearlyPayment: '£320.06',
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should show error when addMoreActions is undefined and action is validate', async () => {
      mockRequest.payload = { addMoreActions: undefined, action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        payment: mockPaymentData,
        parcelItems: [
          {
            parcelId: 'SD6743 8083',
            items: [
              [
                { text: 'CMOR1: Assess moorland and produce a written record' },
                { text: '4.53411078 ha' },
                { text: '£48.06' },
                { html: "<a class='govuk-link' href='confirm-delete-parcel' style='display: none'>Remove</a>" }
              ]
            ]
          }
        ],
        additionalYearlyPayments: [
          {
            items: [
              [
                {
                  text: 'One-off payment per agreement per year for CMOR1: Assess moorland and produce a written record'
                },
                { text: '£272.00' }
              ]
            ]
          }
        ],
        totalYearlyPayment: '£320.06',
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should redirect to select-land-parcel when addMoreActions is "true"', async () => {
      mockRequest.payload = { addMoreActions: 'true' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/select-land-parcel')
      expect(result).toBe('redirected')
    })

    test('should proceed to next path when addMoreActions is "false"', async () => {
      mockRequest.payload = { addMoreActions: 'false' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    test('should proceed to next path when addMoreActions is "no"', async () => {
      mockRequest.payload = { addMoreActions: 'no' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    test('should handle empty payload gracefully when action is validate', async () => {
      mockRequest.payload = { action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        payment: mockPaymentData,
        parcelItems: [
          {
            parcelId: 'SD6743 8083',
            items: [
              [
                { text: 'CMOR1: Assess moorland and produce a written record' },
                { text: '4.53411078 ha' },
                { text: '£48.06' },
                { html: "<a class='govuk-link' href='confirm-delete-parcel' style='display: none'>Remove</a>" }
              ]
            ]
          }
        ],
        additionalYearlyPayments: [
          {
            items: [
              [
                {
                  text: 'One-off payment per agreement per year for CMOR1: Assess moorland and produce a written record'
                },
                { text: '£272.00' }
              ]
            ]
          }
        ],
        totalYearlyPayment: '£320.06',
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should proceed to next path without validation when action is not validate', async () => {
      mockRequest.payload = {}

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    test('should handle null payload gracefully', async () => {
      mockRequest.payload = null

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    test('should handle undefined payload gracefully', async () => {
      mockRequest.payload = undefined

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })
  })

  describe('makeGetRouteHandler', () => {
    test('should call h.view with correct viewName and viewModel', () => {
      // Arrange
      controller.getViewModel = jest.fn().mockReturnValue({ foo: 'bar' })
      controller.getParcelItems = jest.fn().mockReturnValue([
        {
          parcelId: 'SD6743 8083',
          items: [
            [
              { text: 'CMOR1: Assess moorland and produce a written record' },
              { text: '4.53411078 ha' },
              { text: '£48.06' },
              { html: "<a class='govuk-link' href='confirm-delete-parcel' style='display: none'>Remove</a>" }
            ]
          ]
        }
      ])
      controller.getAdditionalYearlyPayments = jest.fn().mockReturnValue([
        {
          items: [
            [
              {
                text: 'One-off payment per agreement per year for CMOR1: Assess moorland and produce a written record'
              },
              { text: '£272.00' }
            ]
          ]
        }
      ])
      controller.collection = {
        getErrors: jest.fn().mockReturnValue([])
      }
      const handler = controller.makeGetRouteHandler()

      // Act
      const result = handler(mockRequest, mockContext, mockH)

      // Assert
      expect(controller.getParcelItems).toHaveBeenCalledWith(mockContext.state)
      expect(controller.getAdditionalYearlyPayments).toHaveBeenCalledWith(mockContext.state)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          foo: 'bar',
          landParcel: expect.any(String),
          payment: expect.any(Object),
          parcelItems: expect.any(Array),
          additionalYearlyPayments: expect.any(Array),
          totalYearlyPayment: expect.any(String),
          errors: []
        })
      )

      expect(result).toBe('rendered view')
    })

    test('should pass errors from collection.getErrors', () => {
      controller.collection.getErrors = jest.fn().mockReturnValue(['error1'])
      controller.getParcelItems = jest.fn().mockReturnValue([])
      controller.getAdditionalYearlyPayments = jest.fn().mockReturnValue([])
      const handler = controller.makeGetRouteHandler()
      handler(mockRequest, mockContext, mockH)
      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          errors: ['error1']
        })
      )
    })
  })

  describe('getAdditionalYearlyPayments', () => {
    test('should return formatted additional yearly payments', () => {
      const controller = new LandActionsCheckPageController()
      const state = {
        payment: {
          agreementLevelItems: mockPaymentData.agreementLevelItems
        }
      }

      const result = controller.getAdditionalYearlyPayments(state)

      expect(result).toEqual([
        {
          items: [
            [
              {
                text: 'One-off payment per agreement per year for CMOR1: Assess moorland and produce a written record'
              },
              {
                text: '£272.00'
              }
            ]
          ]
        }
      ])
    })
  })

  describe('getParcelItems', () => {
    test('should return formatted parcel items', () => {
      const controller = new LandActionsCheckPageController()
      const state = {
        payment: {
          parcelItems: {
            1: mockPaymentData.parcelItems[1]
          }
        }
      }

      const result = controller.getParcelItems(state)

      expect(result).toEqual([
        {
          parcelId: 'SD6743 8083',
          items: [
            [
              {
                text: 'CMOR1: Assess moorland and produce a written record'
              },
              {
                text: '4.53411078 ha'
              },
              {
                text: '£48.06'
              },
              {
                html: "<a class='govuk-link' href='confirm-delete-parcel' style='display: none'>Remove</a>"
              }
            ]
          ]
        }
      ])
    })
  })
})

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
