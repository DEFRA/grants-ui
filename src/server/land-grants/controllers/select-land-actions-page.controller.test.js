import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { beforeEach, describe, expect, test, vi, afterEach } from 'vitest'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import {
  fetchAvailableActionsForParcel,
  fetchParcels,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import { parseLandParcel, stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import SelectLandActionsPageController from './select-land-actions-page.controller.js'
import { log } from '~/src/server/common/helpers/logging/log.js'

vi.mock('~/src/server/common/helpers/logging/log.js')
vi.mock('~/src/server/land-grants/services/land-grants.service.js')
vi.mock('~/src/server/land-grants/utils/format-parcel.js')

const mockParcelsResponse = [
  {
    parcelId: '0155',
    sheetId: 'SD7946',
    area: { unit: 'ha', value: 4.0383 }
  },
  {
    parcelId: '4509',
    sheetId: 'SD7846',
    area: { unit: 'sqm', value: 0.0633 }
  }
]

describe('SelectLandActionsPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH
  let mockResponseWithCode

  const mockGroupedActions = [
    {
      name: 'Assess moorland',
      totalAvailableArea: { unit: 'ha', value: 10 },
      actions: [
        {
          code: 'CMOR1',
          description: 'Assess moorland and produce a written record: CMOR1',
          availableArea: { unit: 'ha', value: 10 },
          ratePerUnitGbp: 16,
          ratePerAgreementPerYearGbp: 272
        }
      ]
    },
    {
      name: 'Livestock grazing on moorland',
      totalAvailableArea: { unit: 'ha', value: 5 },
      actions: [
        {
          code: 'UPL1',
          description: 'Moderate livestock grazing on moorland: UPL1',
          availableArea: { unit: 'ha', value: 5 },
          ratePerUnitGbp: 33
        },
        {
          code: 'UPL2',
          description: 'Heavy livestock grazing on moorland: UPL2',
          availableArea: { unit: 'ha', value: 3 },
          ratePerUnitGbp: 45
        }
      ]
    }
  ]

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Land Actions'
    })

    controller = new SelectLandActionsPageController()
    controller.collection = {
      getErrors: vi.fn().mockReturnValue([])
    }
    controller.setState = vi.fn().mockResolvedValue(true)
    controller.proceed = vi.fn().mockReturnValue('redirected')
    controller.getNextPath = vi.fn().mockReturnValue('/next-path')
    controller.performAuthCheck = vi.fn().mockResolvedValue(null)

    fetchParcels.mockResolvedValue(mockParcelsResponse)

    mockRequest = {
      payload: { landAction_1: 'CMOR1' },
      query: {},
      logger: mockRequestLogger(),
      auth: {
        isAuthenticated: true,
        credentials: {
          sbi: '106284736',
          crn: 'CRN123',
          name: 'John Doe',
          organisationId: 'org123',
          organisationName: 'Farm 1',
          role: 'admin',
          sessionId: 'valid-session-id'
        }
      }
    }

    mockContext = {
      state: {},
      referenceNumber: 'REF123'
    }

    mockResponseWithCode = {
      code: vi.fn().mockReturnValue('final-response')
    }

    mockH = {
      view: vi.fn().mockReturnValue('rendered view'),
      redirect: vi.fn(),
      response: vi.fn().mockReturnValue(mockResponseWithCode)
    }

    parseLandParcel.mockReturnValue(['sheet1', 'parcel1'])
    stringifyParcel.mockImplementation(({ sheetId, parcelId }) => `${sheetId}-${parcelId}`)
    fetchAvailableActionsForParcel.mockResolvedValue({
      actions: mockGroupedActions,
      parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
    })
    validateApplication.mockResolvedValue({ valid: true, errorMessages: [] })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('extractLandActionFieldsFromPayload', () => {
    test('should extract action fields with correct prefix', () => {
      const payload = {
        landAction_1: 'CMOR1',
        landAction_2: 'UPL1',
        otherField: 'value'
      }

      const result = controller.extractLandActionFieldsFromPayload(payload)

      expect(result).toEqual(['landAction_1', 'landAction_2'])
    })

    test('should return empty array when no action fields present', () => {
      const payload = { otherField: 'value' }

      const result = controller.extractLandActionFieldsFromPayload(payload)

      expect(result).toEqual([])
    })
  })

  describe('mapActionToViewModel', () => {
    test('should map action with per unit and per agreement rates', () => {
      const action = mockGroupedActions[0].actions[0]
      const addedActions = []

      const result = controller.mapActionToViewModel(action, addedActions)

      expect(result).toEqual({
        value: 'CMOR1',
        text: 'Assess moorland and produce a written record: CMOR1',
        checked: false,
        hint: {
          html: 'Payment rate per year: <strong>£16.00 per ha</strong> and <strong>£272</strong> per agreement'
        }
      })
    })

    test('should map action with only per unit rate', () => {
      const action = mockGroupedActions[1].actions[0]
      const addedActions = []

      const result = controller.mapActionToViewModel(action, addedActions)

      expect(result).toEqual({
        value: 'UPL1',
        text: 'Moderate livestock grazing on moorland: UPL1',
        checked: false,
        hint: {
          html: 'Payment rate per year: <strong>£33.00 per ha</strong>'
        }
      })
    })

    test('should mark action as checked when already added', () => {
      const addedActions = [{ code: 'CMOR1', description: 'Test' }]
      const action = mockGroupedActions[0].actions[0]

      const result = controller.mapActionToViewModel(action, addedActions)

      expect(result.checked).toBe(true)
    })

    test('should handle missing ratePerUnitGbp', () => {
      const action = { code: 'TEST1', description: 'Test Action' }
      const addedActions = []

      const result = controller.mapActionToViewModel(action, addedActions)

      expect(result.hint.html).toContain('undefined')
    })
  })

  describe('validateUserInput', () => {
    test('should return errors when no actions selected', () => {
      const result = controller.validateUserInput({})

      expect(result).toEqual([{ text: 'Select an action to do on this land parcel', href: '#landAction_1' }])
    })

    test('should return errors when payload has no action fields', () => {
      const result = controller.validateUserInput({ otherField: 'value' })

      expect(result).toEqual([{ text: 'Select an action to do on this land parcel', href: '#landAction_1' }])
    })

    test('should return empty errors when actions are selected', () => {
      const result = controller.validateUserInput({ landAction_1: 'CMOR1' })

      expect(result).toEqual([])
    })
  })

  describe('buildNewState', () => {
    test('should create new parcel when it does not exist', () => {
      const state = { landParcels: {} }
      const actionsObj = {
        CMOR1: { description: 'Test', value: 10, unit: 'ha' }
      }
      const parcel = { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }

      const result = controller.buildNewState(state, actionsObj, parcel)

      expect(result.landParcels['sheet1-parcel1']).toEqual({ size: 10, actionsObj })
    })

    test('should update existing parcel', () => {
      const state = {
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              CMOR1: { description: 'Old', value: 5, unit: 'ha' }
            },
            size: 5
          }
        }
      }
      const actionsObj = {
        UPL1: { description: 'New', value: 3, unit: 'ha' }
      }
      const parcel = { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }

      const result = controller.buildNewState(state, actionsObj, parcel)

      expect(result.landParcels['sheet1-parcel1'].actionsObj).toHaveProperty('UPL1')
      expect(result.landParcels['sheet1-parcel1'].size).toBe(10)
    })
  })

  describe('createNewStateFromPayload', () => {
    test('should create state from payload with actions', () => {
      const state = {}
      const payload = { landAction_1: 'CMOR1' }
      const groupedActions = mockGroupedActions
      const parcel = { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }

      const result = controller.createNewStateFromPayload(state, payload, groupedActions, parcel)

      expect(result.landParcels['sheet1-parcel1'].actionsObj).toEqual({
        CMOR1: {
          description: 'Assess moorland and produce a written record: CMOR1',
          value: 10,
          unit: 'ha'
        }
      })
    })

    test('should handle multiple actions', () => {
      const state = {}
      const payload = {
        landAction_1: 'CMOR1',
        landAction_2: 'UPL1'
      }
      const groupedActions = mockGroupedActions
      const parcel = { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }

      const result = controller.createNewStateFromPayload(state, payload, groupedActions, parcel)

      expect(Object.keys(result.landParcels['sheet1-parcel1'].actionsObj)).toHaveLength(2)
    })

    test('should ignore invalid action codes', () => {
      const state = {}
      const payload = {
        landAction_1: 'INVALID_CODE'
      }
      const groupedActions = mockGroupedActions
      const parcel = { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }

      const result = controller.createNewStateFromPayload(state, payload, groupedActions, parcel)

      expect(result.landParcels['sheet1-parcel1'].actionsObj).toEqual({})
    })

    test('should handle missing availableArea gracefully', () => {
      const groupedActions = [
        {
          name: 'Test',
          actions: [{ code: 'TEST1', description: 'Test Action' }]
        }
      ]
      const state = {}
      const payload = { landAction_1: 'TEST1' }
      const parcel = { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }

      const result = controller.createNewStateFromPayload(state, payload, groupedActions, parcel)

      expect(result.landParcels['sheet1-parcel1'].actionsObj.TEST1).toEqual({
        description: 'Test Action',
        value: '',
        unit: ''
      })
    })
  })

  describe('getAddedActionsForStateParcel', () => {
    test('should extract added actions from state', () => {
      const state = {
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              CMOR1: { description: 'Action 1' },
              UPL1: { description: 'Action 2' }
            }
          }
        }
      }
      const selectedLandParcel = 'sheet1-parcel1'

      const result = controller.getAddedActionsForStateParcel(state, selectedLandParcel)

      expect(result).toEqual([
        { code: 'CMOR1', description: 'Action 1' },
        { code: 'UPL1', description: 'Action 2' }
      ])
    })

    test('should return empty array when no parcel data', () => {
      const state = {}
      const selectedLandParcel = 'sheet1-parcel1'

      const result = controller.getAddedActionsForStateParcel(state, selectedLandParcel)

      expect(result).toEqual([])
    })

    test('should return empty array when parcel has no actions', () => {
      const state = {
        landParcels: {
          'sheet1-parcel1': {}
        }
      }
      const selectedLandParcel = 'sheet1-parcel1'

      const result = controller.getAddedActionsForStateParcel(state, selectedLandParcel)

      expect(result).toEqual([])
    })
  })

  describe('renderErrorView', () => {
    test('should render error view with validation errors', () => {
      const errors = [{ text: 'Error message', href: '#field' }]
      const selectedLandParcel = 'sheet1-parcel1'
      const actions = mockGroupedActions
      const addedActions = []

      controller.renderErrorView(mockH, mockRequest, mockContext, {
        errors,
        selectedLandParcel,
        actions,
        addedActions
      })

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          parcelName: 'sheet1 parcel1',
          errors
        })
      )
    })

    test('should include additional state when provided', () => {
      const errors = [{ text: 'Error', href: '#field' }]
      const selectedLandParcel = 'sheet1-parcel1'
      const actions = mockGroupedActions
      const addedActions = []
      const additionalState = { customProp: 'value' }

      controller.renderErrorView(mockH, mockRequest, mockContext, {
        errors,
        selectedLandParcel,
        actions,
        addedActions,
        additionalState
      })

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          customProp: 'value'
        })
      )
    })

    test('should render error with unable to find actions message', () => {
      const errors = [
        {
          text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
        }
      ]
      const selectedLandParcel = 'sheet1-parcel1'
      const actions = []
      const addedActions = []

      controller.renderErrorView(mockH, mockRequest, mockContext, {
        errors,
        selectedLandParcel,
        actions,
        addedActions
      })

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          parcelName: 'sheet1 parcel1',
          errors: [
            {
              text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
            }
          ]
        })
      )
    })
  })

  describe('GET route handler', () => {
    beforeEach(() => {
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'
    })

    test('should parse valid land parcel and fetch grouped actions', async () => {
      mockRequest.query.parcelId = 'sheet2-parcel2'
      parseLandParcel.mockReturnValue(['sheet2', 'parcel2'])

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, 'sheet2-parcel2')

      expect(parseLandParcel).toHaveBeenCalledWith('sheet2-parcel2')
      expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith({
        parcelId: 'parcel2',
        sheetId: 'sheet2'
      })
    })

    test('should parse valid land parcel and return correct page title', async () => {
      mockRequest.query.parcelId = 'sheet2-parcel2'
      parseLandParcel.mockReturnValue(['sheet2', 'parcel2'])

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.title).toEqual('Select actions for land parcel sheet2 parcel2')
    })

    test('should use state parcel when query not present', async () => {
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith({
        parcelId: 'parcel1',
        sheetId: 'sheet1'
      })
    })

    test('should use state parcel when query not present and set page title', async () => {
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.title).toEqual('Select actions for land parcel sheet1 parcel1')
    })

    test('should render view with correct data', async () => {
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          parcelName: 'sheet1 parcel1',
          addedActions: expect.any(Array)
        })
      )
    })

    test('should extract added actions from state', async () => {
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'
      mockContext.state.landParcels = {
        'sheet1-parcel1': {
          actionsObj: {
            CMOR1: { description: 'Action 1' }
          }
        }
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          addedActions: [{ code: 'CMOR1', description: 'Action 1' }]
        })
      )
    })

    test('should handle fetch errors gracefully', async () => {
      fetchAvailableActionsForParcel.mockRejectedValue(new Error('API Error'))
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining('Unable to find actions information')
            })
          ])
        })
      )

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          messageFunc: expect.any(Function)
        }),
        expect.objectContaining({
          sbi: '106284736',
          sheetId: 'sheet1',
          parcelId: 'parcel1'
        }),
        mockRequest
      )
    })

    test('should log when no actions found', async () => {
      fetchAvailableActionsForParcel.mockResolvedValue({
        actions: [],
        parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
      })
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          messageFunc: expect.any(Function)
        }),
        expect.objectContaining({
          sheetId: 'sheet1',
          parcelId: 'parcel1'
        }),
        mockRequest
      )
    })

    describe('when the user does not own the land parcel', () => {
      it('should return unauthorized response when user does not own the selected land parcel', async () => {
        controller.performAuthCheck.mockResolvedValue('failed auth check')

        const result = await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

        expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, 'sheet1-parcel1')

        expect(result).toEqual('failed auth check')
      })
    })
  })

  describe('POST route handler', () => {
    beforeEach(() => {
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'
      mockRequest.query = { parcelId: 'sheet1-parcel1' }
    })

    describe('.title', () => {
      test('should return correct title is validations pass', async () => {
        mockRequest.payload = { landAction_1: 'CMOR1' }

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(controller.title).toEqual('Select actions for land parcel sheet1 parcel1')
      })

      test('should return correct title is validations fail', async () => {
        mockRequest.payload = { landAction_1: '' }

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(controller.title).toEqual('Select actions for land parcel sheet1 parcel1')
      })
    })

    test('should handle null payload', async () => {
      mockRequest.payload = null

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: [{ text: 'Select an action to do on this land parcel', href: '#landAction_1' }]
        })
      )
    })

    test('should use query parcelId over state when both available', async () => {
      mockRequest.query = { parcelId: 'query-parcel' }
      mockContext.state.selectedLandParcel = 'state-parcel'
      mockRequest.payload = { landAction_1: 'CMOR1' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, 'query-parcel')
    })

    test('should handle result with actions but empty array', async () => {
      fetchAvailableActionsForParcel.mockResolvedValue({ actions: [], parcel: {} })
      mockRequest.payload = { landAction_1: 'CMOR1' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: [
            {
              text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
            }
          ]
        })
      )
    })

    test('should verify payload.action === "validate" comparison', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        action: 'validate'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(validateApplication).toHaveBeenCalled()
    })

    test('should skip validation when action is different', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        action: 'continue'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(validateApplication).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalled()
    })

    test('should return validation result when not null', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'CMOR1', description: 'Invalid', passed: false }]
      })

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).not.toHaveBeenCalled()
      expect(result).not.toBe('redirected')
    })

    test('should handle validation error with no code property', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ description: 'Error without code', passed: false }]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: [{ text: 'Error without code', href: undefined }]
        })
      )
    })

    test('should use actionCode && actionInfo for conditional logic', async () => {
      const groupedActions = [
        {
          name: 'Test',
          actions: [{ code: 'TEST1', description: 'Test Action', availableArea: { value: 5, unit: 'ha' } }]
        }
      ]
      fetchAvailableActionsForParcel.mockResolvedValue({
        actions: groupedActions,
        parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
      })
      mockRequest.payload = {
        landAction_1: 'TEST1',
        landAction_2: ''
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const stateArg = controller.setState.mock.calls[0][1]
      expect(Object.keys(stateArg.landParcels['sheet1-parcel1'].actionsObj)).toHaveLength(1)
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj).toHaveProperty('TEST1')
    })

    test('should update state and proceed on valid submission', async () => {
      mockRequest.payload = { landAction_1: 'CMOR1' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          landParcels: {
            'sheet1-parcel1': {
              size: 10,
              actionsObj: {
                CMOR1: expect.objectContaining({
                  description: 'Assess moorland and produce a written record: CMOR1'
                })
              }
            }
          }
        })
      )
      expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, 'sheet1-parcel1')

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    test('should show errors when no actions selected', async () => {
      mockRequest.payload = {}

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.performAuthCheck).not.toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: [{ text: 'Select an action to do on this land parcel', href: '#landAction_1' }]
        })
      )
    })

    test('should validate actions when validate action requested', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        action: 'validate'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(validateApplication).toHaveBeenCalledWith({
        applicationId: 'REF123',
        sbi: '106284736',
        crn: 'CRN123',
        state: expect.any(Object)
      })
    })

    test('should show validation errors from API', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'CMOR1', description: 'Invalid area', passed: false }]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: [{ text: 'Invalid area: CMOR1', href: '#landAction_1' }]
        })
      )
      expect(controller.proceed).not.toHaveBeenCalled()
    })

    test('should filter passed validation messages', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [
          { code: 'CMOR1', description: 'Passed check', passed: true },
          { code: 'UPL1', description: 'Failed check', passed: false }
        ]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: [expect.objectContaining({ text: 'Failed check: UPL1' })]
        })
      )
    })

    test('should add multiple actions correctly', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        landAction_2: 'UPL1'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          landParcels: {
            'sheet1-parcel1': {
              size: 10,
              actionsObj: expect.objectContaining({
                CMOR1: expect.any(Object),
                UPL1: expect.any(Object)
              })
            }
          }
        })
      )
    })

    test('should replace conflicting action from same group', async () => {
      mockContext.state.landParcels = {
        'sheet1-parcel1': {
          actionsObj: {
            UPL1: { code: 'UPL1', description: 'Moderate', value: 5, unit: 'ha' }
          }
        }
      }
      mockRequest.payload = {
        landAction_1: 'UPL2',
        landAction_2: 'UPL1'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj).toHaveProperty('UPL2')
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj).toHaveProperty('UPL1')
    })

    test('should preserve actions from different groups', async () => {
      mockContext.state.landParcels = {
        'sheet1-parcel1': {
          actionsObj: {
            CMOR1: { code: 'CMOR1', description: 'Assess', value: 10, unit: 'ha' }
          }
        }
      }
      mockRequest.payload = {
        landAction_1: 'UPL1',
        landAction_2: 'CMOR1'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj).toHaveProperty('CMOR1')
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj).toHaveProperty('UPL1')
    })

    test('should handle validation with empty error messages', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: true,
        errorMessages: []
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalled()
    })

    test('should use correct href for validation errors', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        landAction_2: 'UPL1',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'UPL1', description: 'Error for UPL1', passed: false }]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: [{ text: 'Error for UPL1: UPL1', href: '#landAction_2' }]
        })
      )
    })

    test('should proceed without validation when action is not validate', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        action: 'continue'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(validateApplication).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalled()
    })

    test('should preserve state properties when updating', async () => {
      mockContext.state.someProperty = 'value'
      mockContext.state.landParcels = {}
      mockRequest.payload = { landAction_1: 'CMOR1' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg).toHaveProperty('someProperty')
    })

    test('should handle multiple validation errors correctly', async () => {
      mockRequest.payload = {
        landAction_1: 'CMOR1',
        landAction_2: 'UPL1',
        landAction_3: 'UPL2',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [
          { code: 'CMOR1', description: 'Error 1', passed: false },
          { code: 'UPL1', description: 'Error 2', passed: false }
        ]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({ text: 'Error 1: CMOR1', href: '#landAction_1' }),
            expect.objectContaining({ text: 'Error 2: UPL1', href: '#landAction_2' })
          ])
        })
      )
    })

    test('should render view with error when validateApplication throws error with status code', async () => {
      const apiError = new Error('Validation API failed')
      apiError.code = 400

      mockRequest.payload = {
        landAction_1: 'CMOR1',
        action: 'validate'
      }

      validateApplication.mockRejectedValue(apiError)

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: expect.arrayContaining([
            {
              href: '',
              text: 'There has been an issue validating the application, please try again later or contact the Rural Payments Agency.'
            }
          ])
        })
      )
    })

    test('should handle timeout when fetching available actions gracefully', async () => {
      fetchAvailableActionsForParcel.mockRejectedValue(new Error('Operation timed out after 30000ms'))

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions-for-land-parcel',
        expect.objectContaining({
          errors: [
            {
              text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
            }
          ]
        })
      )
    })

    describe('when the user does not own the land parcel', () => {
      it('should return unauthorized response when user does not own the selected land parcel', async () => {
        controller.performAuthCheck.mockResolvedValue('failed auth check')
        mockRequest.query = { parcelId: 'sheet1-parcel1' }

        const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

        expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, 'sheet1-parcel1')

        expect(result).toEqual('failed auth check')
      })
    })
  })
})
