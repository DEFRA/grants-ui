import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { vi } from 'vitest'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import {
  fetchAvailableActionsForParcel,
  parseLandParcel,
  triggerApiActionsValidation
} from '~/src/server/land-grants/services/land-grants.service.js'
import SelectActionsForLandParcelPageController from './select-actions-for-land-parcel-page.controller.js'

vi.mock('~/src/server/land-grants/services/land-grants.service.js')

describe('SelectActionsForLandParcelPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const mockGroupedActions = [
    {
      name: 'Assess moorland',
      totalAvailableArea: {
        unit: 'ha',
        value: 10
      },
      actions: [
        {
          code: 'CMOR1',
          description: 'Assess moorland and produce a written record: CMOR1',
          availableArea: {
            unit: 'ha',
            value: 10
          },
          ratePerUnitGbp: 16,
          ratePerAgreementPerYearGbp: 272
        }
      ]
    },
    {
      name: 'Livestock grazing on moorland',
      totalAvailableArea: {
        unit: 'ha',
        value: 5
      },
      actions: [
        {
          code: 'UPL1',
          description: 'Moderate livestock grazing on moorland: UPL1',
          availableArea: {
            unit: 'ha',
            value: 5
          },
          ratePerUnitGbp: 33
        },
        {
          code: 'UPL2',
          description: 'Heavy livestock grazing on moorland: UPL2',
          availableArea: {
            unit: 'ha',
            value: 3
          },
          ratePerUnitGbp: 45
        }
      ]
    }
  ]

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Land Actions'
    })

    controller = new SelectActionsForLandParcelPageController()
    controller.groupedActions = mockGroupedActions
    controller.selectedLandParcel = 'sheet1-parcel1'
    controller.collection = {
      getErrors: vi.fn().mockReturnValue([])
    }
    controller.setState = vi.fn().mockResolvedValue(true)
    controller.proceed = vi.fn().mockReturnValue('redirected')
    controller.getNextPath = vi.fn().mockReturnValue('/next-path')

    mockRequest = {
      payload: {
        landAction_1: 'CMOR1'
      },
      logger: mockRequestLogger(),
      auth: {
        isAuthenticated: true,
        credentials: {
          sbi: '106284736',
          name: 'John Doe',
          organisationId: 'org123',
          organisationName: ' Farm 1',
          role: 'admin',
          sessionId: 'valid-session-id'
        }
      }
    }

    mockContext = {
      state: {}
    }

    mockH = {
      view: vi.fn().mockReturnValue('rendered view')
    }

    parseLandParcel.mockReturnValue(['sheet1', 'parcel1'])
    fetchAvailableActionsForParcel.mockResolvedValue(mockGroupedActions)

    triggerApiActionsValidation.mockResolvedValue({
      valid: true,
      errorMessages: []
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
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
          landAction_1: {
            text: 'Select an action to do on this land parcel'
          }
        },
        errorSummary: [{ text: 'Select an action to do on this land parcel', href: '#landAction_1' }]
      })
    })

    test('should return error object if payload is empty', () => {
      const landAction = ''

      const result = controller.validateUserInput(landAction)

      expect(result).toEqual({
        errorSummary: [
          {
            href: '#landAction_1',
            text: 'Select an action to do on this land parcel'
          }
        ],
        errors: {
          landAction_1: {
            text: 'Select an action to do on this land parcel'
          }
        }
      })
    })
  })

  describe('extractActionsDataFromPayload', () => {
    test('should extract action data correctly from payload', () => {
      const payload = {
        landAction_1: 'CMOR1'
      }

      const result = controller.extractActionsDataFromPayload(payload)

      expect(result).toEqual({
        actionsObj: {
          CMOR1: {
            description: 'Assess moorland and produce a written record: CMOR1',
            value: 10,
            unit: 'ha'
          }
        }
      })
    })

    test('should ignore action codes not present in grouped actions', () => {
      const payload = {
        landAction_1: 'unknownAction'
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

    test('should handle missing availableArea unit gracefully', () => {
      controller.groupedActions = [
        {
          name: 'Test Group',
          actions: [
            {
              code: 'CMOR1',
              description: 'Assess moorland and produce a written record: CMOR1',
              availableArea: {}
            }
          ]
        }
      ]

      const payload = {
        landAction_1: 'CMOR1'
      }

      const result = controller.extractActionsDataFromPayload(payload)

      expect(result).toEqual({
        actionsObj: {
          CMOR1: {
            description: 'Assess moorland and produce a written record: CMOR1',
            value: '',
            unit: ''
          }
        }
      })
    })
  })

  describe('buildNewState', () => {
    test('should create new land parcel when none exists', () => {
      controller.selectedLandParcel = 'sheet1-parcel1'
      const state = {
        landParcels: {}
      }
      const actionsObj = {
        CMOR1: {
          description: 'Assess moorland and produce a written record: CMOR1',
          value: 10,
          unit: 'ha'
        }
      }

      const result = controller.buildNewState(state, actionsObj)

      expect(result).toEqual({
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              CMOR1: {
                description: 'Assess moorland and produce a written record: CMOR1',
                value: 10,
                unit: 'ha'
              }
            }
          }
        }
      })
    })

    test('should add new action to existing parcel when no conflicts', () => {
      controller.selectedLandParcel = 'sheet1-parcel1'
      const state = {
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              UPL1: {
                description: 'Moderate livestock grazing on moorland: UPL1',
                value: 5,
                unit: 'ha'
              }
            }
          }
        }
      }
      const actionsObj = {
        UPL1: {
          description: 'Moderate livestock grazing on moorland: UPL1',
          value: 5,
          unit: 'ha'
        },
        CMOR1: {
          description: 'Assess moorland and produce a written record: CMOR1',
          value: 10,
          unit: 'ha'
        }
      }

      const result = controller.buildNewState(state, actionsObj)

      expect(result.landParcels['sheet1-parcel1'].actionsObj).toEqual({
        UPL1: {
          description: 'Moderate livestock grazing on moorland: UPL1',
          value: 5,
          unit: 'ha'
        },
        CMOR1: {
          description: 'Assess moorland and produce a written record: CMOR1',
          value: 10,
          unit: 'ha'
        }
      })
    })

    test('should replace existing action when from same group', () => {
      controller.selectedLandParcel = 'sheet1-parcel1'
      const state = {
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              UPL1: {
                description: 'Moderate livestock grazing on moorland: UPL1',
                value: 5,
                unit: 'ha'
              },
              CMOR1: {
                description: 'Assess moorland and produce a written record: CMOR1',
                value: 10,
                unit: 'ha'
              }
            }
          }
        }
      }
      const actionsObj = {
        CMOR1: {
          description: 'Assess moorland and produce a written record: CMOR1',
          value: 10,
          unit: 'ha'
        },
        UPL2: {
          description: 'Heavy livestock grazing on moorland: UPL2',
          value: 3,
          unit: 'ha'
        }
      }

      const result = controller.buildNewState(state, actionsObj)

      expect(result.landParcels['sheet1-parcel1'].actionsObj).toEqual({
        UPL2: {
          description: 'Heavy livestock grazing on moorland: UPL2',
          value: 3,
          unit: 'ha'
        },
        CMOR1: {
          description: 'Assess moorland and produce a written record: CMOR1',
          value: 10,
          unit: 'ha'
        }
      })
    })

    test('should handle empty groupedActions', () => {
      controller.selectedLandParcel = 'sheet1-parcel1'
      controller.groupedActions = []

      const state = {
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              UNKNOWN1: { description: 'Unknown action', value: 5, unit: 'ha' }
            }
          }
        }
      }
      const actionsObj = {
        UNKNOWN2: { description: 'Another unknown action', value: 3, unit: 'ha' }
      }

      const result = controller.buildNewState(state, actionsObj)

      expect(result.landParcels['sheet1-parcel1'].actionsObj).toEqual({
        UNKNOWN2: { description: 'Another unknown action', value: 3, unit: 'ha' }
      })
    })

    test('should preserve other parcel properties', () => {
      controller.selectedLandParcel = 'sheet1-parcel1'
      const state = {
        landParcels: {
          'sheet1-parcel1': {
            someProp: 'value',
            anotherProp: 123,
            actionsObj: {
              CMOR1: {
                description: 'Assess moorland and produce a written record: CMOR1',
                value: 10,
                unit: 'ha'
              }
            }
          }
        }
      }
      const actionsObj = {
        UPL1: {
          description: 'Moderate livestock grazing on moorland: UPL1',
          value: 5,
          unit: 'ha'
        },
        CMOR1: {
          description: 'Assess moorland and produce a written record: CMOR1',
          value: 10,
          unit: 'ha'
        }
      }

      const result = controller.buildNewState(state, actionsObj)

      expect(result.landParcels['sheet1-parcel1']).toEqual({
        someProp: 'value',
        anotherProp: 123,
        actionsObj: {
          UPL1: {
            description: 'Moderate livestock grazing on moorland: UPL1',
            value: 5,
            unit: 'ha'
          },
          CMOR1: {
            description: 'Assess moorland and produce a written record: CMOR1',
            value: 10,
            unit: 'ha'
          }
        }
      })
    })
  })

  describe('getViewModel', () => {
    test('should extend parent view model with grouped actions', () => {
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
        actionFieldPrefix: 'landAction_',
        groupedActions: [
          {
            name: 'Assess moorland',
            totalAvailableArea: {
              unit: 'ha',
              value: 10
            },
            actions: [
              {
                value: 'CMOR1',
                text: 'Assess moorland and produce a written record: CMOR1',
                checked: false,
                hint: {
                  html: 'Payment rate per year: <strong>£16.00 per ha</strong> and <strong>£272</strong> per agreement'
                }
              }
            ]
          },
          {
            name: 'Livestock grazing on moorland',
            totalAvailableArea: {
              unit: 'ha',
              value: 5
            },
            actions: [
              {
                value: 'UPL1',
                text: 'Moderate livestock grazing on moorland: UPL1',
                checked: false,
                hint: {
                  html: 'Payment rate per year: <strong>£33.00 per ha</strong>'
                }
              },
              {
                value: 'UPL2',
                checked: false,
                text: 'Heavy livestock grazing on moorland: UPL2',
                hint: {
                  html: 'Payment rate per year: <strong>£45.00 per ha</strong>'
                }
              }
            ]
          }
        ]
      })
    })

    test('should handle empty grouped actions', () => {
      controller.groupedActions = []
      const mockParentViewModel = { pageTitle: 'Land Actions' }
      QuestionPageController.prototype.getViewModel.mockReturnValue(mockParentViewModel)

      const result = controller.getViewModel(mockRequest, mockContext)

      expect(result).toEqual({
        ...mockParentViewModel,
        actionFieldPrefix: 'landAction_',
        groupedActions: []
      })
    })
  })

  describe('GET route handler', () => {
    test('should parse valid land parcel and fetch grouped actions', async () => {
      parseLandParcel.mockReturnValue(['sheet1', 'parcel1'])
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(parseLandParcel).toHaveBeenCalledWith('sheet1-parcel1')
      expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith({
        parcelId: 'parcel1',
        sheetId: 'sheet1'
      })
      expect(controller.groupedActions).toEqual(mockGroupedActions)
    })

    test('should render view with correct data', async () => {
      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          parcelName: 'sheet1 parcel1',
          groupedActions: expect.arrayContaining([
            expect.objectContaining({
              name: 'Assess moorland',
              actions: expect.arrayContaining([
                expect.objectContaining({
                  value: 'CMOR1',
                  text: 'Assess moorland and produce a written record: CMOR1'
                })
              ])
            })
          ])
        })
      )
      expect(result).toBe('rendered view')
    })

    test('should extract added actions from state correctly', async () => {
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'
      mockContext.state.landParcels = {
        'sheet1-parcel1': {
          actionsObj: {
            CMOR1: {
              description: 'Assess moorland and produce a written record: CMOR1'
            },
            UPL1: {
              description: 'Moderate livestock grazing on moorland: UPL1'
            }
          }
        }
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.addedActions).toEqual([
        { code: 'CMOR1', description: 'Assess moorland and produce a written record: CMOR1' },
        { code: 'UPL1', description: 'Moderate livestock grazing on moorland: UPL1' }
      ])
    })

    test('should handle fetch errors gracefully', async () => {
      fetchAvailableActionsForParcel.mockRejectedValue(new Error('API error'))

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.groupedActions).toEqual([])
      expect(mockRequest.logger.error).toHaveBeenCalledWith(
        expect.any(Error),
        'Failed to fetch land parcel data for id sheet1-parcel1'
      )
    })

    test('should log error when no actions found', async () => {
      fetchAvailableActionsForParcel.mockResolvedValue([])

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.logger.error).toHaveBeenCalledWith({
        message: 'No actions found for parcel sheet1-parcel1',
        selectedLandParcel: 'sheet1-parcel1'
      })
    })

    test('should default sheetId and parcelId when landParcel is missing', async () => {
      mockContext.state = {}
      parseLandParcel.mockReturnValue(['', ''])

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith({
        parcelId: '',
        sheetId: ''
      })
    })
  })

  describe('POST route handler', () => {
    test('should update state with form values and proceed', async () => {
      controller.selectedLandParcel = 'sheet1-parcel1'
      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          landParcels: {
            'sheet1-parcel1': {
              actionsObj: {
                CMOR1: {
                  description: 'Assess moorland and produce a written record: CMOR1',
                  unit: 'ha',
                  value: 10
                }
              }
            }
          }
        })
      )

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    test('should add more land actions to existing land parcel', async () => {
      controller.selectedLandParcel = 'sheet1-parcel1'
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        landAction_2: 'UPL1'
      }

      mockContext.state.landParcels = {
        'sheet1-parcel1': {
          actionsObj: {
            CMOR1: {
              description: 'Assess moorland and produce a written record: CMOR1',
              unit: 'ha',
              value: 10
            }
          }
        }
      }
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          landParcels: {
            'sheet1-parcel1': {
              actionsObj: {
                CMOR1: {
                  description: 'Assess moorland and produce a written record: CMOR1',
                  unit: 'ha',
                  value: 10
                },
                UPL1: {
                  description: 'Moderate livestock grazing on moorland: UPL1',
                  value: 5,
                  unit: 'ha'
                }
              }
            }
          }
        })
      )
    })

    test('should replace action when selecting different action from same group', async () => {
      controller.selectedLandParcel = 'sheet1-parcel1'
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        landAction_2: 'UPL2'
      }

      mockContext.state.landParcels = {
        'sheet1-parcel1': {
          actionsObj: {
            UPL1: {
              description: 'Moderate livestock grazing on moorland: UPL1',
              unit: 'ha',
              value: 5
            },
            CMOR1: {
              description: 'Assess moorland and produce a written record: CMOR1',
              unit: 'ha',
              value: 10
            }
          }
        }
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          landParcels: {
            'sheet1-parcel1': {
              actionsObj: {
                UPL2: {
                  description: 'Heavy livestock grazing on moorland: UPL2',
                  value: 3,
                  unit: 'ha'
                },
                CMOR1: {
                  description: 'Assess moorland and produce a written record: CMOR1',
                  unit: 'ha',
                  value: 10
                }
              }
            }
          }
        })
      )
    })

    describe('validations', () => {
      beforeEach(() => {
        controller.selectedLandParcel = 'sheet1-parcel1'
      })

      test('should handle empty payload gracefully', async () => {
        mockRequest.payload = null

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(mockH.view).toHaveBeenCalledWith('select-actions-for-land-parcel', expect.any(Object))
      })

      test('should call triggerApiActionsValidation with correct parameters', async () => {
        const controller = new SelectActionsForLandParcelPageController()
        const sheetId = 'sheet1'
        const parcelId = 'parcel1'
        const actionsObj = { CMOR1: { value: 10 } }

        triggerApiActionsValidation.mockResolvedValue({ valid: true, errorMessages: [] })

        await controller.validateActionsWithApiData(mockContext.payload, actionsObj, sheetId, parcelId)

        expect(triggerApiActionsValidation).toHaveBeenCalledWith({
          sheetId,
          parcelId,
          actionsObj
        })
      })

      test('should not add errors if API validation is valid', async () => {
        const controller = new SelectActionsForLandParcelPageController()
        triggerApiActionsValidation.mockResolvedValue({ valid: true, errorMessages: [] })

        const result = await controller.validateActionsWithApiData({ CMOR1: { value: 10 } }, 'sheet1', 'parcel1')

        expect(result.errors).toEqual({})
        expect(result.errorSummary).toEqual([])
      })

      test('should add errors from API errorMessages if not valid', async () => {
        const controller = new SelectActionsForLandParcelPageController()
        const errorMessages = [{ code: 'CMOR1', description: 'Invalid quantity for CMOR1' }]
        triggerApiActionsValidation.mockResolvedValue({ valid: false, errorMessages })

        const result = await controller.validateActionsWithApiData(
          mockRequest.payload,
          { CMOR1: { value: 10 } },
          'sheet1',
          'parcel1'
        )

        expect(result.errors).toEqual({
          landAction_1: { text: 'Invalid quantity for CMOR1' }
        })
        expect(result.errorSummary).toEqual([{ text: 'Invalid quantity for CMOR1', href: '#landAction_1' }])
      })

      test('should handle no actions selected', async () => {
        mockRequest.payload = {
          landAction_1: '',
          action: 'validate'
        }

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(triggerApiActionsValidation).not.toHaveBeenCalled()
        expect(mockH.view).toHaveBeenCalledWith(
          'select-actions-for-land-parcel',
          expect.objectContaining({
            parcelName: 'sheet1 parcel1',
            errorSummary: [
              {
                text: 'Select an action to do on this land parcel',
                href: '#landAction_1'
              }
            ],
            errors: {
              landAction_1: {
                text: 'Select an action to do on this land parcel'
              }
            }
          })
        )
      })

      test('should validate actions when validate action is requested', async () => {
        mockRequest.payload = {
          landAction_1: 'CMOR1',
          action: 'validate'
        }

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
              description: 'Assess moorland and produce a written record: CMOR1',
              value: 10,
              unit: 'ha'
            }
          }
        })

        expect(controller.proceed).toHaveBeenCalled()
      })

      test('should handle API validation errors and return error view', async () => {
        mockRequest.payload = {
          landAction_1: 'CMOR1',
          action: 'validate'
        }

        triggerApiActionsValidation.mockResolvedValue({
          valid: false,
          errorMessages: [{ code: 'CMOR1', description: 'Invalid area specified for CMOR1' }]
        })

        const handler = controller.makePostRouteHandler()
        const result = await handler(mockRequest, mockContext, mockH)

        expect(controller.proceed).not.toHaveBeenCalled()
        expect(mockH.view).toHaveBeenCalledWith(
          'select-actions-for-land-parcel',
          expect.objectContaining({
            parcelName: 'sheet1 parcel1',
            errorSummary: [{ text: 'Invalid area specified for CMOR1', href: '#landAction_1' }],
            errors: {
              landAction_1: { text: 'Invalid area specified for CMOR1' }
            }
          })
        )
        expect(result).toBe('rendered view')
      })
    })
  })
})
