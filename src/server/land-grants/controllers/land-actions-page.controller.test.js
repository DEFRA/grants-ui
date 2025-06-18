import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import {
  fetchAvailableActionsForParcel,
  parseLandParcel,
  validateLandActions
} from '~/src/server/land-grants/services/land-grants.service.js'
import LandActionsPageController from './land-actions-page.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')
jest.mock('~/src/server/land-grants/services/land-grants.service.js')

describe('LandActionsPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const selectedLandParcelSummary = {
    name: 'sheet1-parcel1',
    rows: [
      {
        key: {
          text: 'Total size'
        },
        value: {
          text: 'Not available'
        }
      }
    ]
  }

  const availableActions = [
    {
      code: 'CMOR1',
      description: 'CMOR1: Assess moorland and produce a written record',
      availableArea: {
        unit: 'ha',
        value: 792.43
      }
    },
    {
      code: 'UPL1',
      description: 'UPL1: Moderate livestock grazing on moorland',
      availableArea: {
        unit: 'ha',
        value: 792.43
      }
    }
  ]

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Land Actions'
    })

    controller = new LandActionsPageController()
    controller.availableActions = availableActions
    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }
    controller.setState = jest.fn().mockResolvedValue(true)
    controller.proceed = jest.fn().mockReturnValue('redirected')
    controller.getNextPath = jest.fn().mockReturnValue('/next-path')

    mockRequest = {
      payload: {
        'qty-CMOR1': 10,
        selectedActions: ['CMOR1', 'UPL1']
      },
      logger: {
        error: jest.fn()
      }
    }

    mockContext = {
      state: {
        selectedLandParcel: 'sheet1-parcel1'
      }
    }

    mockH = {
      view: jest.fn().mockReturnValue('rendered view')
    }

    parseLandParcel.mockReturnValue(['sheet1', 'parcel1'])

    validateLandActions.mockResolvedValue({
      valid: true,
      errorMessages: []
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('choose-which-actions-to-do')
  })

  describe('extractActionsObjectFromPayload', () => {
    test('should extract action data correctly from payload', () => {
      const payload = {
        selectedActions: ['CMOR1', 'UPL1'],
        'qty-CMOR1': 10,
        'qty-UPL1': 5,
        'other-field': 'value'
      }

      const result = controller.extractActionsObjectFromPayload(payload)

      expect(result).toEqual({
        CMOR1: {
          description: 'CMOR1: Assess moorland and produce a written record',
          value: 10,
          unit: 'ha'
        },
        UPL1: {
          description: 'UPL1: Moderate livestock grazing on moorland',
          value: 5,
          unit: 'ha'
        }
      })
    })

    test('should ignore action codes not present in availableActions', () => {
      const payload = {
        selectedActions: ['unknownAction'],
        'qty-unknownAction': 15
      }

      const result = controller.extractActionsObjectFromPayload(payload)

      expect(result).toEqual({})
    })

    test('should handle empty payload', () => {
      const result = controller.extractActionsObjectFromPayload({})

      expect(result).toEqual({})
    })

    test('should skip actions not included in actions array', () => {
      const payload = {
        selectedActions: ['CMOR1'],
        'qty-CMOR1': 10,
        'qty-UPL1': 5
      }

      const result = controller.extractActionsObjectFromPayload(payload)

      expect(result).toEqual({
        CMOR1: {
          description: 'CMOR1: Assess moorland and produce a written record',
          value: 10,
          unit: 'ha'
        }
      })
    })

    test('should skip actions with empty quantity values', () => {
      const payload = {
        selectedActions: ['CMOR1', 'UPL1'],
        'qty-CMOR1': 10,
        'qty-UPL1': ''
      }

      const result = controller.extractActionsObjectFromPayload(payload)

      expect(result).toEqual({
        CMOR1: {
          description: 'CMOR1: Assess moorland and produce a written record',
          value: 10,
          unit: 'ha'
        }
      })
    })

    test('should handle missing availableArea unit gracefully', () => {
      controller.availableActions = [
        {
          code: 'CMOR1',
          description: 'CMOR1: Assess moorland and produce a written record',
          availableArea: null
        }
      ]

      const payload = {
        selectedActions: ['CMOR1'],
        'qty-CMOR1': 10
      }

      const result = controller.extractActionsObjectFromPayload(payload)

      expect(result).toEqual({
        CMOR1: {
          description: 'CMOR1: Assess moorland and produce a written record',
          value: 10,
          unit: undefined
        }
      })
    })
  })

  describe('getViewModel', () => {
    test('should extend parent view model with quantity prefix and available actions', () => {
      const mockParentViewModel = {
        pageTitle: 'Land Actions',
        formModel: {},
        errors: []
      }
      QuestionPageController.prototype.getViewModel.mockReturnValue(
        mockParentViewModel
      )

      const result = controller.getViewModel(mockRequest, mockContext)

      expect(
        QuestionPageController.prototype.getViewModel
      ).toHaveBeenCalledWith(mockRequest, mockContext)
      expect(result).toEqual({
        ...mockParentViewModel,
        quantityPrefix: 'qty-',
        availableActions
      })
    })

    test('should handle empty available actions', () => {
      controller.availableActions = []
      const mockParentViewModel = { pageTitle: 'Land Actions' }
      QuestionPageController.prototype.getViewModel.mockReturnValue(
        mockParentViewModel
      )

      const result = controller.getViewModel(mockRequest, mockContext)

      expect(result).toEqual({
        ...mockParentViewModel,
        quantityPrefix: 'qty-',
        availableActions: []
      })
    })
  })

  describe('GET route handler', () => {
    test('should get available actions and render view with correct data', async () => {
      fetchAvailableActionsForParcel.mockResolvedValue({
        actions: availableActions
      })

      mockContext.state.selectedActions = ['CMOR1', 'UPL1']

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith({
        parcelId: 'parcel1',
        sheetId: 'sheet1'
      })
      expect(mockH.view).toHaveBeenCalledWith(
        'choose-which-actions-to-do',
        expect.objectContaining({
          selectedLandParcel: 'sheet1-parcel1',
          availableActions,
          selectedLandParcelSummary,
          selectedActions: ['CMOR1', 'UPL1']
        })
      )
      expect(result).toBe('rendered view')
    })

    test('should handle fetch errors gracefully', async () => {
      fetchAvailableActionsForParcel.mockRejectedValue(new Error('API error'))

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'choose-which-actions-to-do',
        expect.objectContaining({
          availableActions: []
        })
      )
      expect(mockRequest.logger.error).toHaveBeenCalled()
    })

    test('should log error when no actions found', async () => {
      fetchAvailableActionsForParcel.mockResolvedValue({
        parcel: {
          actions: []
        }
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.logger.error).toHaveBeenCalledWith({
        selectedLandParcel: 'sheet1-parcel1',
        message: 'No actions found for parcel sheet1-parcel1'
      })
    })

    test('should default sheetId and parcelId when landParcel is missing', async () => {
      mockContext.state = {}
      parseLandParcel.mockReturnValue(['', ''])

      fetchAvailableActionsForParcel.mockResolvedValue({
        parcel: { actions: [] }
      })

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith({
        parcelId: '',
        sheetId: ''
      })
      expect(mockH.view).toHaveBeenCalledWith(
        'choose-which-actions-to-do',
        expect.objectContaining({
          availableActions: []
        })
      )
      expect(result).toBe('rendered view')
    })

    test('should default to empty actions when parcel.actions is undefined', async () => {
      fetchAvailableActionsForParcel.mockResolvedValue({
        parcel: {}
      })

      controller.collection.getErrors.mockReturnValue([])

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'choose-which-actions-to-do',
        expect.objectContaining({
          availableActions: [],
          selectedLandParcelSummary,
          selectedLandParcel: 'sheet1-parcel1'
        })
      )
      expect(result).toBe('rendered view')
    })

    test('should handle undefined data response from fetchAvailableActionsForParcel', async () => {
      fetchAvailableActionsForParcel.mockResolvedValue(undefined)

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.availableActions).toEqual([])
      expect(mockRequest.logger.error).toHaveBeenCalledWith(
        expect.any(TypeError),
        'Failed to fetch land parcel data for id sheet1-parcel1'
      )
    })

    test('should handle null data response from fetchAvailableActionsForParcel', async () => {
      fetchAvailableActionsForParcel.mockResolvedValue(null)

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.availableActions).toEqual([])
      expect(mockRequest.logger.error).toHaveBeenCalledWith(
        expect.any(TypeError),
        'Failed to fetch land parcel data for id sheet1-parcel1'
      )
    })
  })

  describe('POST route handler', () => {
    test('should update state with form values and proceed', async () => {
      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          selectedLandParcel: 'sheet1-parcel1',
          selectedLandParcelSummary,
          landParcels: {
            'sheet1-parcel1': {
              actionsObj: {
                CMOR1: {
                  description:
                    'CMOR1: Assess moorland and produce a written record',
                  unit: 'ha',
                  value: 10
                }
              }
            }
          }
        })
      )

      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/next-path'
      )

      expect(result).toBe('redirected')
    })

    test('should handle empty payload gracefully', async () => {
      mockRequest.payload = null

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          selectedLandParcel: 'sheet1-parcel1',
          landParcels: {
            'sheet1-parcel1': {
              actionsObj: {}
            }
          }
        })
      )
    })

    test('should handle missing actions gracefully', async () => {
      mockRequest.payload = {
        selectedActions: [],
        action: 'validate'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(validateLandActions).not.toHaveBeenCalled()

      expect(mockH.view).toHaveBeenCalledWith(
        'choose-which-actions-to-do',
        expect.objectContaining({
          errors: ['Please select at least one action and quantity']
        })
      )
    })

    test('should validate actions when validate action is requested', async () => {
      mockRequest.payload = {
        'qty-CMOR1': 10,
        selectedActions: ['CMOR1'],
        action: 'validate'
      }

      validateLandActions.mockResolvedValue({
        valid: true,
        errorMessages: []
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(validateLandActions).toHaveBeenCalledWith({
        sheetId: 'sheet1',
        parcelId: 'parcel1',
        actionsObj: {
          CMOR1: {
            description: 'CMOR1: Assess moorland and produce a written record',
            value: 10,
            unit: 'ha'
          }
        }
      })

      expect(controller.proceed).toHaveBeenCalled()
    })

    test('should render view with validation errors when validation fails', async () => {
      mockRequest.payload = {
        'qty-CMOR1': 10,
        selectedActions: ['CMOR1'],
        action: 'validate'
      }

      const errorMessages = [
        {
          code: 'CMOR1',
          description: 'CMOR1: Error in action validation'
        }
      ]

      validateLandActions.mockResolvedValue({
        valid: false,
        errorMessages
      })

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(validateLandActions).toHaveBeenCalledWith({
        sheetId: 'sheet1',
        parcelId: 'parcel1',
        actionsObj: {
          CMOR1: {
            description: 'CMOR1: Assess moorland and produce a written record',
            value: 10,
            unit: 'ha'
          }
        }
      })

      expect(mockH.view).toHaveBeenCalledWith(
        'choose-which-actions-to-do',
        expect.objectContaining({
          errors: errorMessages.map((m) => `${m.code}: ${m.description}`),
          availableActions
        })
      )

      expect(controller.proceed).not.toHaveBeenCalled()
      expect(result).toBe('rendered view')
    })

    test('should render view with errors when no action is selected', async () => {
      mockRequest.payload = {
        action: 'validate'
      }

      validateLandActions.mockResolvedValue({
        valid: true,
        errorMessages: []
      })

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'choose-which-actions-to-do',
        expect.objectContaining({
          errors: ['Please select at least one action and quantity'],
          availableActions
        })
      )

      expect(controller.proceed).not.toHaveBeenCalled()
      expect(result).toBe('rendered view')
    })
  })
})

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
