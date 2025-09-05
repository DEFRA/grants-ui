import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import {
  fetchAvailableActionsForParcel,
  parseLandParcel,
  triggerApiActionsValidation
} from '~/src/server/land-grants/services/land-grants.service.js'
import SelectActionsForLandParcelPageController from './select-actions-for-land-parcel-page.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')
jest.mock('~/src/server/land-grants/services/land-grants.service.js')

describe('SelectActionsForLandParcelPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const availableActions = [
    {
      code: 'CMOR1',
      description: 'CMOR1: Assess moorland and produce a written record',
      availableArea: {
        unit: 'ha',
        value: 10
      },
      ratePerUnitGbp: 16,
      ratePerAgreementPerYearGbp: 272
    },
    {
      code: 'UPL1',
      description: 'UPL1: Moderate livestock grazing on moorland',
      availableArea: {
        unit: 'ha',
        value: 5
      },
      ratePerUnitGbp: 33
    }
  ]

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Land Actions'
    })

    controller = new SelectActionsForLandParcelPageController()
    controller.availableActions = availableActions
    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }
    controller.setState = jest.fn().mockResolvedValue(true)
    controller.proceed = jest.fn().mockReturnValue('redirected')
    controller.getNextPath = jest.fn().mockReturnValue('/next-path')

    mockRequest = {
      payload: {
        landAction: 'CMOR1'
      },
      logger: {
        error: jest.fn()
      },
      auth: {
        isAuthenticated: true,
        credentials: {
          sbi: '123456789',
          name: 'John Doe',
          organisationId: 'org123',
          organisationName: ' Farm 1',
          role: 'admin',
          sessionId: 'valid-session-id'
        }
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

    triggerApiActionsValidation.mockResolvedValue({
      valid: true,
      errorMessages: []
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('select-actions-for-land-parcel')
  })

  describe('validateUserInput', () => {
    test('should return errors if no landAction is selected', () => {
      const landAction = ''

      const result = controller.validateUserInput(landAction)

      expect(result).toEqual({
        errors: {
          landAction: {
            text: 'Select an action to do on this land parcel'
          }
        },
        errorSummary: [{ text: 'Select an action to do on this land parcel', href: '#landAction' }]
      })
    })

    test('should return empty object if payload includes landAction', () => {
      const landAction = 'CMOR1'

      const result = controller.validateUserInput(landAction)

      expect(result).toEqual({})
    })
  })

  describe('extractActionsDataFromPayload', () => {
    test('should extract action data correctly from payload', () => {
      const payload = {
        landAction: 'CMOR1'
      }

      const result = controller.extractActionsDataFromPayload(payload)

      expect(result).toEqual({
        actionsObj: {
          CMOR1: {
            description: 'CMOR1: Assess moorland and produce a written record',
            value: 10,
            unit: 'ha',
            annualPaymentPence: 100
          }
        }
      })
    })

    test('should ignore action codes not present in availableActions', () => {
      const payload = {
        landAction: 'unknownAction'
      }

      const result = controller.extractActionsDataFromPayload(payload)

      expect(result).toEqual({
        actionsObj: {}
      })
    })

    test('should handle empty payload', () => {
      const result = controller.extractActionsDataFromPayload({})

      expect(result).toEqual({ actionsObj: {} })
    })

    test('should skip actions not included in actions array', () => {
      const payload = {
        landAction: 'CMOR1'
      }

      const result = controller.extractActionsDataFromPayload(payload)

      expect(result).toEqual({
        actionsObj: {
          CMOR1: {
            description: 'CMOR1: Assess moorland and produce a written record',
            value: 10,
            unit: 'ha',
            annualPaymentPence: 100
          }
        }
      })
    })

    test('should handle missing availableArea unit gracefully', () => {
      controller.availableActions = [
        {
          code: 'CMOR1',
          description: 'CMOR1: Assess moorland and produce a written record',
          availableArea: ''
        }
      ]

      const payload = {
        landAction: 'CMOR1'
      }

      const result = controller.extractActionsDataFromPayload(payload)

      expect(result).toEqual({
        actionsObj: {
          CMOR1: {
            description: 'CMOR1: Assess moorland and produce a written record',
            value: '',
            unit: '',
            annualPaymentPence: 100
          }
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
      QuestionPageController.prototype.getViewModel.mockReturnValue(mockParentViewModel)

      const result = controller.getViewModel(mockRequest, mockContext)

      expect(QuestionPageController.prototype.getViewModel).toHaveBeenCalledWith(mockRequest, mockContext)
      expect(result).toEqual({
        ...mockParentViewModel,
        availableActions,
        assessMoorlandArea: 10,
        livestockGrazingArea: 5,
        assessMoorlandAction: [
          {
            value: 'CMOR1',
            text: 'CMOR1: Assess moorland and produce a written record',
            hint: {
              text: 'Payment rate per year: £16 per ha and £272 per agreement'
            }
          }
        ],
        displayActions: [
          {
            value: 'UPL1',
            text: 'UPL1: Moderate livestock grazing on moorland',
            hint: {
              text: 'Payment rate per year: £33 per ha'
            }
          }
        ]
      })
    })

    test('should handle empty available actions', () => {
      controller.availableActions = []
      const mockParentViewModel = { pageTitle: 'Land Actions' }
      QuestionPageController.prototype.getViewModel.mockReturnValue(mockParentViewModel)

      const result = controller.getViewModel(mockRequest, mockContext)

      expect(result).toEqual({
        ...mockParentViewModel,
        availableActions: [],
        assessMoorlandArea: 0,
        livestockGrazingArea: 0,
        assessMoorlandAction: [],
        displayActions: []
      })
    })

    test('should add assess moorland area and livestock grazing area to view model', () => {
      const aa = [
        ...availableActions,
        {
          code: 'UPL2',
          description: 'UPL2: Moderate livestock grazing on moorland',
          availableArea: {
            unit: 'ha',
            value: 6
          },
          ratePerUnitGbp: 63
        }
      ]
      controller.availableActions = aa
      const mockParentViewModel = { pageTitle: 'Land Actions' }
      QuestionPageController.prototype.getViewModel.mockReturnValue(mockParentViewModel)

      const result = controller.getViewModel(mockRequest, mockContext)

      expect(result).toEqual({
        ...mockParentViewModel,
        availableActions: aa,
        assessMoorlandArea: 10,
        livestockGrazingArea: 6,
        assessMoorlandAction: [
          {
            value: 'CMOR1',
            text: 'CMOR1: Assess moorland and produce a written record',
            hint: {
              text: 'Payment rate per year: £16 per ha and £272 per agreement'
            }
          }
        ],
        displayActions: [
          {
            value: 'UPL1',
            text: 'UPL1: Moderate livestock grazing on moorland',
            hint: {
              text: 'Payment rate per year: £33 per ha'
            }
          },
          {
            value: 'UPL2',
            text: 'UPL2: Moderate livestock grazing on moorland',
            hint: {
              text: 'Payment rate per year: £63 per ha'
            }
          }
        ]
      })
    })
  })

  describe('GET route handler', () => {
    test('should parse valid land parcel with both sheetId and parcelId', async () => {
      // Mock parseLandParcel to return both values
      parseLandParcel.mockReturnValue(['sheet1', 'parcel1'])

      mockContext.state.selectedLandParcel = 'sheet1-parcel1'

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(parseLandParcel).toHaveBeenCalledWith('sheet1-parcel1')

      // Verify fetchAvailableActionsForParcel was called with correct parsed values
      expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith({
        parcelId: 'parcel1',
        sheetId: 'sheet1'
      })
    })

    test('should get available actions and render view with correct data', async () => {
      fetchAvailableActionsForParcel.mockResolvedValue({
        actions: availableActions
      })

      mockContext.state.landAction = 'CMOR1'
      if (!mockContext.state.landParcels) {
        mockContext.state.landParcels = {}
      }
      mockContext.state.landParcels['sheet1-parcel1'] = {
        actionsObj: {
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
        }
      }

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith({
        parcelId: 'parcel1',
        sheetId: 'sheet1'
      })
      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          selectedLandParcel: 'sheet1-parcel1',
          availableActions,
          parcelName: 'sheet1 parcel1'
        })
      )
      expect(result).toBe('rendered view')
    })

    test('should handle fetch errors gracefully', async () => {
      fetchAvailableActionsForParcel.mockRejectedValue(new Error('API error'))

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
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
        'select-actions-for-land-parcel',
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
        'select-actions-for-land-parcel',
        expect.objectContaining({
          availableActions: [],
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
      // Mock fetchAvailableActionsForParcel to return available actions
      fetchAvailableActionsForParcel.mockResolvedValue({
        actions: availableActions
      })

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          selectedLandParcel: 'sheet1-parcel1',
          landParcels: {
            'sheet1-parcel1': {
              actionsObj: {
                CMOR1: {
                  description: 'CMOR1: Assess moorland and produce a written record',
                  unit: 'ha',
                  value: 10,
                  annualPaymentPence: 100
                }
              }
            }
          }
        })
      )

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')

      expect(result).toBe('redirected')
    })

    test('add more land actions to existing land parcel', async () => {
      mockRequest = {
        payload: {
          landAction: 'UPL1'
        },
        logger: {
          error: jest.fn()
        },
        auth: {
          isAuthenticated: true,
          credentials: {
            sbi: '123456789',
            name: 'John Doe',
            organisationId: 'org123',
            organisationName: ' Farm 1',
            role: 'admin',
            sessionId: 'valid-session-id'
          }
        }
      }

      // Set up state with existing CMOR1 action
      mockContext.state.landParcels = {
        'sheet1-parcel1': {
          actionsObj: {
            CMOR1: {
              annualPaymentPence: 50,
              description: 'CMOR1: Assess moorland and produce a written record',
              unit: 'ha',
              value: 10
            }
          }
        }
      }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          selectedLandParcel: 'sheet1-parcel1',
          landParcels: {
            'sheet1-parcel1': {
              actionsObj: {
                CMOR1: {
                  description: 'CMOR1: Assess moorland and produce a written record',
                  unit: 'ha',
                  value: 10,
                  annualPaymentPence: 50
                },
                UPL1: {
                  description: 'UPL1: Moderate livestock grazing on moorland',
                  value: 5,
                  unit: 'ha',
                  annualPaymentPence: 200
                }
              }
            }
          }
        })
      )

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')

      expect(result).toBe('redirected')
    })

    describe('validations', () => {
      test('should handle empty payload gracefully', async () => {
        mockRequest.payload = null

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(mockH.view).toHaveBeenCalledWith('select-actions-for-land-parcel', expect.any(Object))
      })

      // Test that triggerApiActionsValidation is called with correct arguments
      test('should call triggerApiActionsValidation with correct parameters', async () => {
        const controller = new SelectActionsForLandParcelPageController()
        const sheetId = 'sheet1'
        const parcelId = 'parcel1'
        const actionsObj = { CMOR1: { value: 10 } }

        triggerApiActionsValidation.mockResolvedValue({ valid: true, errorMessages: [] })

        await controller.validateActionsWithApiData(actionsObj, sheetId, parcelId)

        expect(triggerApiActionsValidation).toHaveBeenCalledWith({
          sheetId,
          parcelId,
          actionsObj
        })
      })

      // Test that valid response returns no errors
      test('should not add errors if API validation is valid', async () => {
        const controller = new SelectActionsForLandParcelPageController()
        triggerApiActionsValidation.mockResolvedValue({ valid: true, errorMessages: [] })

        const result = await controller.validateActionsWithApiData({ CMOR1: { value: 10 } }, 'sheet1', 'parcel1')

        expect(result.errors).toEqual({})
        expect(result.errorSummary).toEqual([])
      })

      // Test that invalid response adds errors from errorMessages
      test('should add errors from API errorMessages if not valid', async () => {
        const controller = new SelectActionsForLandParcelPageController()
        const errorMessages = [{ code: 'CMOR1', description: 'Invalid quantity for CMOR1' }]
        triggerApiActionsValidation.mockResolvedValue({ valid: false, errorMessages })

        const result = await controller.validateActionsWithApiData({ CMOR1: { value: 10 } }, 'sheet1', 'parcel1')

        expect(result.errors).toEqual({
          CMOR1: { text: 'Invalid quantity for CMOR1' }
        })
        expect(result.errorSummary).toEqual([{ text: 'Invalid quantity for CMOR1', href: '#landAction' }])
      })

      test('should handle no actions selected', async () => {
        mockRequest.payload = {
          landAction: '',
          action: 'validate'
        }

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(triggerApiActionsValidation).not.toHaveBeenCalled()

        expect(mockH.view).toHaveBeenCalledWith(
          'select-actions-for-land-parcel',
          expect.objectContaining({
            availableActions: [
              {
                availableArea: { unit: 'ha', value: 10 },
                code: 'CMOR1',
                description: 'CMOR1: Assess moorland and produce a written record',
                ratePerUnitGbp: 16,
                ratePerAgreementPerYearGbp: 272
              },
              {
                availableArea: { unit: 'ha', value: 5 },
                code: 'UPL1',
                description: 'UPL1: Moderate livestock grazing on moorland',
                ratePerUnitGbp: 33
              }
            ],
            parcelName: 'sheet1 parcel1',
            errorSummary: [
              {
                text: 'Select an action to do on this land parcel',
                href: '#landAction'
              }
            ],
            errors: {
              landAction: {
                text: 'Select an action to do on this land parcel'
              }
            }
          })
        )
      })
    })

    test('should validate actions when validate action is requested', async () => {
      mockRequest.payload = {
        landAction: 'CMOR1',
        action: 'validate'
      }

      // Mock fetchAvailableActionsForParcel to return available actions
      fetchAvailableActionsForParcel.mockResolvedValue({
        actions: availableActions
      })

      triggerApiActionsValidation.mockResolvedValue({
        valid: true,
        errorMessages: []
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(triggerApiActionsValidation).toHaveBeenCalledWith({
        sheetId: 'sheet1',
        parcelId: 'parcel1',
        actionsObj: {
          CMOR1: {
            description: 'CMOR1: Assess moorland and produce a written record',
            value: 10,
            unit: 'ha',
            annualPaymentPence: 100
          }
        }
      })

      expect(controller.proceed).toHaveBeenCalled()
    })

    describe('fetching available actions', () => {
      test('should get available actions and render view with correct data', async () => {
        mockRequest.payload = {
          landAction: 'CMOR1',
          action: 'validate'
        }

        fetchAvailableActionsForParcel.mockResolvedValue({
          actions: availableActions
        })

        mockContext.state.landAction = 'CMOR1'
        if (!mockContext.state.landParcels) {
          mockContext.state.landParcels = {}
        }
        mockContext.state.landParcels['sheet1-parcel1'] = {
          actionsObj: {
            CMOR1: {
              description: 'CMOR1: Assess moorland and produce a written record',
              value: 10,
              unit: 'ha'
            }
          }
        }

        const handler = controller.makePostRouteHandler()
        const result = await handler(mockRequest, mockContext, mockH)

        expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith({
          parcelId: 'parcel1',
          sheetId: 'sheet1'
        })
        expect(controller.setState).toHaveBeenCalledWith(
          mockRequest,
          expect.objectContaining({
            selectedLandParcel: 'sheet1-parcel1',
            landParcels: {
              'sheet1-parcel1': {
                actionsObj: {
                  CMOR1: {
                    description: 'CMOR1: Assess moorland and produce a written record',
                    unit: 'ha',
                    value: 10,
                    annualPaymentPence: 100
                  }
                }
              }
            }
          })
        )

        expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')

        expect(result).toBe('redirected')
      })

      test('should handle fetch errors gracefully', async () => {
        mockRequest.payload = {
          landAction: '', // Empty string has length 0
          action: 'validate' // This is required to trigger validation
        }

        fetchAvailableActionsForParcel.mockRejectedValue(new Error('API error'))

        // Mock triggerApiActionsValidation (won't be called since actionsObj is empty)
        triggerApiActionsValidation.mockResolvedValue({
          valid: true,
          errorMessages: []
        })

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        // Verify that h.view was called with error information
        expect(mockH.view).toHaveBeenCalledWith(
          'select-actions-for-land-parcel',
          expect.objectContaining({
            availableActions: [
              {
                availableArea: { unit: 'ha', value: 10 },
                code: 'CMOR1',
                description: 'CMOR1: Assess moorland and produce a written record',
                ratePerUnitGbp: 16,
                ratePerAgreementPerYearGbp: 272
              },
              {
                availableArea: { unit: 'ha', value: 5 },
                code: 'UPL1',
                description: 'UPL1: Moderate livestock grazing on moorland',
                ratePerUnitGbp: 33
              }
            ],
            errorSummary: [
              {
                href: '#landAction',
                text: 'Select an action to do on this land parcel' // Updated message
              }
            ],
            errors: {
              landAction: {
                text: 'Select an action to do on this land parcel' // Updated message
              }
            },
            pageTitle: 'Land Actions', // Added missing property
            parcelName: 'sheet1 parcel1'
          })
        )

        const result = await handler(mockRequest, mockContext, mockH)

        // Verify that proceed was NOT called due to validation errors
        expect(controller.proceed).not.toHaveBeenCalled()
        expect(result).toBe('rendered view')
      })

      test('should log error when no actions found', async () => {
        fetchAvailableActionsForParcel.mockResolvedValue({
          parcel: {
            actions: []
          }
        })

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(mockRequest.logger.error).toHaveBeenCalledWith({
          selectedLandParcel: 'sheet1-parcel1',
          message: 'No actions found for parcel sheet1-parcel1'
        })

        expect(controller.availableActions).toEqual([])

        expect(mockRequest.logger.error).toHaveBeenCalledWith({
          message: 'No actions found for parcel sheet1-parcel1',
          selectedLandParcel: 'sheet1-parcel1'
        })
      })
    })
  })
})

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
