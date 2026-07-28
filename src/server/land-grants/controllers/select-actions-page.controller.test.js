import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import {
  fetchActionsForParcel,
  fetchActionsWithPlannedActions,
  fetchParcels,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import { parseLandParcel, stringifyParcel } from '~/src/shared/format-parcel.js'
import SelectActionsPageController from './select-actions-page.controller.js'
import { error, log } from '~/src/server/common/helpers/logging/log.js'
import { config } from '~/src/config/config.js'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => ({
  QuestionPageController: class {
    getViewModel() {}

    makeGetRouteHandler() {
      return async (request, context, h) => h.view('select-actions', this.getViewModel(request, context))
    }

    makePostRouteHandler() {
      return async (request, context, h) => h.view('select-actions', this.getViewModel(request, context))
    }
  }
}))

vi.mock('~/src/server/task-list/task-list.helper.js', () => ({
  withTaskContext: (Base) => Base
}))

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchParcelsFromDal: vi.fn().mockResolvedValue([])
}))

vi.mock('~/src/server/land-grants/services/parcel-cache.js', () => ({
  getCachedAuthParcels: vi.fn().mockReturnValue(null),
  setCachedAuthParcels: vi.fn()
}))

vi.mock('~/src/config/config.js', async () => {
  const { mockLandGrantsConfig } = await import('~/src/__mocks__')
  return mockLandGrantsConfig()
})
vi.mock('~/src/server/land-grants/services/land-grants.service.js')
vi.mock('~/src/shared/format-parcel.js')

const mockParcelsResponse = [
  {
    parcelId: '0155',
    sheetId: 'SD7946',
    area: { unit: 'ha', value: 4.0383 }
  }
]
const userContext = { defraIdToken: 'defra-id-access-token', sbi: '106284736' }

describe('SelectActionsPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH
  let mockResponseWithCode

  const enabledLandActions = ['CMOR1', 'UPL1', 'UPL2']

  const mockActions = [
    {
      code: 'CMOR1',
      description: 'Assess moorland and produce a written record: CMOR1',
      availableArea: { unit: 'ha', value: 10 },
      ratePerUnitGbp: 16,
      ratePerAgreementPerYearGbp: 272
    },
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
      ratePerUnitGbp: 45,
      requiresMaxQuantity: 3
    }
  ]

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Select Actions',
      page: {
        model: { pages: [] },
        def: { pages: [], metadata: { tasklist: {} } }
      }
    })

    const mockModel = { def: { metadata: { tasklist: {}, enabledLandActions } }, getSection: vi.fn(), pages: [] }
    controller = new SelectActionsPageController(mockModel, {})
    controller.collection = {
      getErrors: vi.fn().mockReturnValue([])
    }
    controller.setState = vi.fn().mockResolvedValue(true)
    controller.proceed = vi.fn().mockReturnValue('redirected')
    controller.getNextPath = vi.fn().mockReturnValue('/next-path')
    controller.performAuthCheck = vi.fn().mockResolvedValue(null)

    fetchParcels.mockResolvedValue(mockParcelsResponse)

    mockRequest = {
      payload: { landAction: 'CMOR1' },
      query: {},
      logger: mockRequestLogger(),
      auth: {
        isAuthenticated: true,
        credentials: {
          token: userContext.defraIdToken,
          sbi: userContext.sbi,
          crn: 'CRN123',
          name: 'John Doe',
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
    fetchActionsForParcel.mockResolvedValue({
      actions: mockActions,
      parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
    })
    validateApplication.mockResolvedValue({ valid: true, errorMessages: [] })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('has the select-actions view name', () => {
    expect(controller.viewName).toBe('select-actions')
  })

  describe('GET route handler', () => {
    beforeEach(() => {
      mockRequest.query = { parcelId: 'sheet1-parcel1' }
    })

    test('should redirect to /select-land-parcel if no selected land parcel is set', async () => {
      mockRequest.query = {}

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/select-land-parcel')
      expect(result).toBe('redirected')
    })

    test('should fetch actions for the parcel', async () => {
      mockRequest.query.parcelId = 'sheet2-parcel2'
      parseLandParcel.mockReturnValue(['sheet2', 'parcel2'])

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(fetchActionsForParcel).toHaveBeenCalledWith(
        {
          parcelId: 'parcel2',
          sheetId: 'sheet2',
          enabledLandActions,
          plannedActions: []
        },
        userContext
      )
    })

    test('should render the view with a flat actionItems list rather than grouped actions', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          parcelName: 'sheet1 parcel1',
          actionItems: expect.arrayContaining([
            expect.objectContaining({ value: 'CMOR1' }),
            expect.objectContaining({ value: 'UPL1' }),
            expect.objectContaining({ value: 'UPL2' })
          ])
        })
      )
      const { actionItems } = mockH.view.mock.calls[0][1]
      expect(actionItems).toHaveLength(3)
    })

    test('should surface a conditional quantity input for actions that require a max quantity', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl2 = actionItems.find((item) => item.value === 'UPL2')
      const cmor1 = actionItems.find((item) => item.value === 'CMOR1')

      expect(upl2.conditional.html).toContain('landActionQuantity_UPL2')
      expect(cmor1.conditional).toBeUndefined()
    })

    test('should return an empty pageConsents array when no action requires SSSI consent or HEFER', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.pageConsents).toEqual([])
    })

    test('should include hefer in pageConsents when an action requires a HEFER and the feature flag is on', async () => {
      config.get.mockImplementation((key) => key === 'landGrants.enableHeferFeature')
      fetchActionsForParcel.mockResolvedValue({
        actions: [{ ...mockActions[0], heferRequired: true }, mockActions[1], mockActions[2]],
        parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.pageConsents).toEqual(['hefer'])
    })

    test('should include sssi in pageConsents when an action requires SSSI consent and the feature flag is on', async () => {
      config.get.mockImplementation((key) => key === 'landGrants.enableSSSIFeature')
      fetchActionsForParcel.mockResolvedValue({
        actions: [{ ...mockActions[0], sssiConsentRequired: true }, mockActions[1], mockActions[2]],
        parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.pageConsents).toEqual(['sssi'])
    })

    test('should not include hefer in pageConsents when an action requires a HEFER but the feature flag is off', async () => {
      fetchActionsForParcel.mockResolvedValue({
        actions: [{ ...mockActions[0], heferRequired: true }, mockActions[1], mockActions[2]],
        parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.pageConsents).toEqual([])
    })

    test('should pre-populate the quantity input with the value previously saved to state, on refresh', async () => {
      mockContext.state.landParcels = {
        'sheet1-parcel1': {
          actionsObj: {
            UPL2: { description: 'Heavy livestock grazing on moorland: UPL2', value: '1.5' }
          }
        }
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl2 = actionItems.find((item) => item.value === 'UPL2')

      expect(upl2.checked).toBe(true)
      expect(upl2.conditional.html).toContain('value="1.5"')
    })

    test('should handle fetch errors gracefully', async () => {
      fetchActionsForParcel.mockRejectedValue(new Error('API Error'))

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining('Unable to find actions information')
            })
          ])
        })
      )

      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', messageFunc: expect.any(Function) }),
        expect.objectContaining({ sbi: '106284736', sheetId: 'sheet1', parcelId: 'parcel1' }),
        mockRequest
      )
    })

    test('should log when no actions found', async () => {
      fetchActionsForParcel.mockResolvedValue({
        actions: [],
        parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', messageFunc: expect.any(Function) }),
        expect.objectContaining({ sheetId: 'sheet1', parcelId: 'parcel1' }),
        mockRequest
      )
    })

    describe('when the user does not own the land parcel', () => {
      it('should return unauthorized response when user does not own the selected land parcel', async () => {
        controller.performAuthCheck.mockResolvedValue('failed auth check')

        const result = await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

        expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, ['sheet1-parcel1'])
        expect(result).toEqual('failed auth check')
      })
    })
  })

  describe('POST route handler', () => {
    beforeEach(() => {
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'
      mockRequest.query = { parcelId: 'sheet1-parcel1' }
    })

    test('should show errors when no actions selected', async () => {
      mockRequest.payload = {}

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: [{ text: 'Select an action to do on this land parcel', href: '#landAction' }]
        })
      )
    })

    test('should update state and proceed on valid submission', async () => {
      mockRequest.payload = { landAction: 'CMOR1' }

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
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    test('should add multiple independently-selected actions correctly (flat checkbox model)', async () => {
      mockRequest.payload = {
        landAction: ['CMOR1', 'UPL1']
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

    test('should save the recomputed availableArea for a non-quantity action competing with a quantity claim from the same submission', async () => {
      mockRequest.payload = {
        landAction: ['UPL1', 'UPL2'],
        landActionQuantity_UPL2: '1'
      }
      fetchActionsWithPlannedActions.mockResolvedValue({
        actions: [
          { code: 'UPL1', availableArea: { unit: 'ha', value: 4 } },
          { code: 'UPL2', availableArea: { unit: 'ha', value: 2 }, requiresMaxQuantity: 2 }
        ]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(fetchActionsForParcel).toHaveBeenCalledTimes(1)
      expect(fetchActionsWithPlannedActions).toHaveBeenCalledWith(
        expect.objectContaining({
          plannedActions: [{ actionCode: 'UPL2', quantity: 1, unit: 'ha' }]
        }),
        expect.anything()
      )
      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj.UPL1.value).toBe(4)
    })

    test('should keep the original uncompeted actions when the recompute fetch fails', async () => {
      mockRequest.payload = {
        landAction: ['UPL1', 'UPL2'],
        landActionQuantity_UPL2: '1'
      }
      fetchActionsWithPlannedActions.mockRejectedValue(Object.assign(new Error('boom'), { status: 503 }))

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj.UPL1.value).toBe(5)
    })

    test('should show an error and not save state when a quantity-required action has no submitted quantity', async () => {
      mockRequest.payload = { landAction: 'UPL2' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: [
            {
              text: 'Enter a quantity for Heavy livestock grazing on moorland: UPL2',
              href: '#landActionQuantity_UPL2',
              code: 'UPL2'
            }
          ]
        })
      )
      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).not.toHaveBeenCalled()
    })

    test('should show an error when a quantity-required action has a submitted quantity of 0', async () => {
      mockRequest.payload = { landAction: 'UPL2', landActionQuantity_UPL2: '0' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: [
            {
              text: 'Enter a quantity for Heavy livestock grazing on moorland: UPL2',
              href: '#landActionQuantity_UPL2',
              code: 'UPL2'
            }
          ]
        })
      )
      expect(controller.setState).not.toHaveBeenCalled()
    })

    test('should store the submitted quantity override for an action that requires one', async () => {
      mockRequest.payload = {
        landAction: 'UPL2',
        landActionQuantity_UPL2: '1.5'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj.UPL2.value).toBe(1.5)
    })

    test('should not persist a quantity for an action that does not require one, even if submitted', async () => {
      mockRequest.payload = {
        landAction: 'CMOR1',
        landActionQuantity_CMOR1: '2'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj.CMOR1.value).toBe(10)
    })

    test('should not save anything to state when no action is selected', async () => {
      mockRequest.payload = { landActionQuantity_UPL2: '1.5' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: [{ text: 'Select an action to do on this land parcel', href: '#landAction' }]
        })
      )
      expect(controller.setState).not.toHaveBeenCalled()
    })

    test('should verify payload.action === "validate" comparison', async () => {
      mockRequest.payload = { landAction: 'CMOR1', action: 'validate' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(validateApplication).toHaveBeenCalled()
    })

    test('should show validation errors from API', async () => {
      mockRequest.payload = { landAction: 'CMOR1', action: 'validate' }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'CMOR1', description: 'Invalid area', passed: false }]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: [{ text: 'Invalid area: CMOR1', href: '#landActionQuantity_CMOR1' }]
        })
      )
      expect(controller.proceed).not.toHaveBeenCalled()
    })

    // Regression: the quantity hint must show the recomputed available area, not the stale total.
    test('should show the recomputed available area in the quantity hint when application validation fails', async () => {
      mockRequest.payload = {
        landAction: ['UPL1', 'UPL2'],
        landActionQuantity_UPL2: '1',
        action: 'validate'
      }
      fetchActionsWithPlannedActions.mockResolvedValue({
        actions: [
          { code: 'UPL1', availableArea: { unit: 'ha', value: 4 } },
          { code: 'UPL2', availableArea: { unit: 'ha', value: 2 }, requiresMaxQuantity: 2 }
        ]
      })
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'UPL2', description: 'Not enough available area', passed: false }]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl2 = actionItems.find((item) => item.value === 'UPL2')

      expect(upl2.conditional.html).toContain('2 hectares available')
      expect(upl2.conditional.html).not.toContain('3 hectares available')
    })

    test('should link a validation error to the specific action quantity input by code, not position', async () => {
      mockRequest.payload = { landAction: ['CMOR1', 'UPL1'], action: 'validate' }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'UPL1', description: 'Invalid quantity', passed: false }]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: [{ text: 'Invalid quantity: UPL1', href: '#landActionQuantity_UPL1' }]
        })
      )
    })

    // Regression: on a failed validation, the just-submitted selections/quantities must
    // still be shown as checked/pre-filled - not lost by falling back to the state as it
    // was before this submission.
    test('should keep the just-submitted selections checked when the API validation fails', async () => {
      mockRequest.payload = {
        landAction: ['CMOR1', 'UPL2'],
        landActionQuantity_UPL2: '1.5',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'UPL2', description: 'Invalid quantity', passed: false }]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const { actionItems } = mockH.view.mock.calls[0][1]
      const cmor1 = actionItems.find((item) => item.value === 'CMOR1')
      const upl2 = actionItems.find((item) => item.value === 'UPL2')

      expect(cmor1.checked).toBe(true)
      expect(upl2.checked).toBe(true)
      expect(upl2.conditional.html).toContain('value="1.5"')
    })

    test('should highlight the govukInput for the action whose quantity failed validation', async () => {
      mockRequest.payload = {
        landAction: 'UPL2',
        landActionQuantity_UPL2: '10',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [
          {
            code: 'UPL2',
            description: 'The amount of land must be the same as or less than the available area',
            passed: false
          }
        ]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl2 = actionItems.find((item) => item.value === 'UPL2')

      expect(upl2.conditional.html).toContain('govuk-input--error')
      expect(upl2.conditional.html).toContain('The amount of land must be the same as or less than the available area')
    })

    test('should not highlight quantity inputs for actions unaffected by the validation error', async () => {
      mockRequest.payload = {
        landAction: ['UPL2'],
        landActionQuantity_UPL2: '10',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'CMOR1', description: 'Some other error', passed: false }]
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl2 = actionItems.find((item) => item.value === 'UPL2')

      expect(upl2.conditional.html).not.toContain('govuk-input--error')
    })

    test('should keep the just-submitted selections checked when validateApplication throws', async () => {
      mockRequest.payload = { landAction: 'CMOR1', action: 'validate' }
      validateApplication.mockRejectedValue(new Error('Validation API failed'))

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      const { actionItems } = mockH.view.mock.calls[0][1]
      expect(actionItems.find((item) => item.value === 'CMOR1').checked).toBe(true)
    })

    describe('when the user does not own the land parcel', () => {
      it('should return unauthorized response when user does not own the selected land parcel', async () => {
        controller.performAuthCheck.mockResolvedValue('failed auth check')
        mockRequest.query = { parcelId: 'sheet1-parcel1' }

        const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

        expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, ['sheet1-parcel1'])
        expect(result).toEqual('failed auth check')
      })
    })
  })
})
