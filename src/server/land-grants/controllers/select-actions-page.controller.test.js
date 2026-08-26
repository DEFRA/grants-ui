import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  fetchActionsForParcel,
  fetchActionsWithPlannedActions,
  fetchParcels,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import SelectActionsPageController from './select-actions-page.controller.js'
import { error, log } from '~/src/server/common/helpers/logging/log.js'
import { config } from '~/src/config/config.js'
import {
  CMOR1,
  PARCELS_WITH_SIZE,
  UPL1,
  UPL2,
  USER_CONTEXT,
  makeLandGrantsRequest,
  makeViewToolkit,
  mockFormatParcelImplementations,
  stubControllerMethods
} from '~/src/server/land-grants/test-helpers.js'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', async () => {
  const { makeQuestionPageControllerMock } = await import('~/src/__mocks__')
  return makeQuestionPageControllerMock('select-actions')
})

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

describe('SelectActionsPageController', () => {
  const post = () => controller.makePostRouteHandler()(mockRequest, mockContext, mockH)
  const get = () => controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

  let controller
  let mockRequest
  let mockContext
  let mockH

  const enabledLandActions = ['CMOR1', 'UPL1', 'UPL2']

  const mockActions = [CMOR1, UPL1, { ...UPL2, availability: { ...UPL2.availability, type: 'partial' } }]

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Select Actions',
      page: {
        model: { pages: [] },
        def: { pages: [], metadata: { tasklist: {} } }
      }
    })

    const mockModel = { def: { metadata: { tasklist: {}, enabledLandActions } }, getSection: vi.fn(), pages: [] }
    controller = stubControllerMethods(new SelectActionsPageController(mockModel, {}))

    fetchParcels.mockResolvedValue(PARCELS_WITH_SIZE.slice(0, 1))

    mockRequest = makeLandGrantsRequest({ payload: { landAction: 'CMOR1' } })
    mockContext = { state: {}, referenceNumber: 'REF123' }
    mockH = makeViewToolkit()

    mockFormatParcelImplementations()
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

      const result = await get()

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/select-land-parcel')
      expect(result).toBe('redirected')
    })

    test('should fetch actions for the parcel', async () => {
      mockRequest.query.parcelId = 'sheet2-parcel2'
      mockFormatParcelImplementations({ sheetId: 'sheet2', parcelId: 'parcel2' })

      await get()

      expect(fetchActionsForParcel).toHaveBeenCalledWith(
        {
          parcelId: 'parcel2',
          sheetId: 'sheet2',
          enabledLandActions,
          plannedActions: []
        },
        USER_CONTEXT
      )
    })

    test('should render the view with a flat actionItems list rather than grouped actions', async () => {
      await get()

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
      await get()

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl2 = actionItems.find((item) => item.value === 'UPL2')
      const cmor1 = actionItems.find((item) => item.value === 'CMOR1')

      expect(upl2.conditional.html).toContain('landActionQuantity_UPL2')
      expect(cmor1.conditional).toBeUndefined()
    })

    test('should render the parcel summary list with reference and area', async () => {
      fetchActionsForParcel.mockResolvedValue({
        actions: mockActions,
        parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: { value: 45.22, unit: 'ha' } }
      })

      await get()

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.parcelSummaryList.rows).toEqual([
        { key: { text: 'Parcel reference' }, value: { text: 'sheet1 parcel1' } },
        { key: { text: 'Total area' }, value: { text: '45.22 hectares' } }
      ])
    })

    test('should return an empty pageConsents array when no action requires SSSI consent or HEFER', async () => {
      await get()

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.pageConsents).toEqual([])
    })

    test('should include hefer in pageConsents when an action requires a HEFER and the feature flag is on', async () => {
      config.get.mockImplementation((key) => key === 'landGrants.enableHeferFeature')
      fetchActionsForParcel.mockResolvedValue({
        actions: [{ ...mockActions[0], heferRequired: true }, mockActions[1], mockActions[2]],
        parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
      })

      await get()

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.pageConsents).toEqual(['hefer'])
    })

    test('should include sssi in pageConsents when an action requires SSSI consent and the feature flag is on', async () => {
      config.get.mockImplementation((key) => key === 'landGrants.enableSSSIFeature')
      fetchActionsForParcel.mockResolvedValue({
        actions: [{ ...mockActions[0], sssiConsentRequired: true }, mockActions[1], mockActions[2]],
        parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
      })

      await get()

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.pageConsents).toEqual(['sssi'])
    })

    test('should not include hefer in pageConsents when an action requires a HEFER but the feature flag is off', async () => {
      fetchActionsForParcel.mockResolvedValue({
        actions: [{ ...mockActions[0], heferRequired: true }, mockActions[1], mockActions[2]],
        parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
      })

      await get()

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

      await get()

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl2 = actionItems.find((item) => item.value === 'UPL2')

      expect(upl2.checked).toBe(true)
      expect(upl2.conditional.html).toContain('value="1.5"')
    })

    test('should handle fetch errors gracefully', async () => {
      fetchActionsForParcel.mockRejectedValue(new Error('API Error'))

      await get()

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

      await get()

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', messageFunc: expect.any(Function) }),
        expect.objectContaining({ sheetId: 'sheet1', parcelId: 'parcel1' }),
        mockRequest
      )
    })

    test('should return the unauthorized response when the user does not own the selected land parcel', async () => {
      controller.performAuthCheck.mockResolvedValue('failed auth check')

      const result = await get()

      expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, ['sheet1-parcel1'])
      expect(result).toEqual('failed auth check')
    })
  })

  describe('POST route handler', () => {
    beforeEach(() => {
      mockContext.state.selectedLandParcel = 'sheet1-parcel1'
      mockRequest.query = { parcelId: 'sheet1-parcel1' }
    })

    test('should show errors when no actions selected', async () => {
      mockRequest.payload = {}

      await post()

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: [{ text: 'Select at least one action', href: '#landAction' }],
          selectionErrorText: 'Select at least one action'
        })
      )
    })

    test('should not treat a quantity error as the checkbox group error', async () => {
      mockRequest.payload = { landAction: 'UPL2' }

      await post()

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({ selectionErrorText: undefined })
      )
    })

    test('should update state and proceed on valid submission', async () => {
      mockRequest.payload = { landAction: 'CMOR1' }

      const result = await post()

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

      await post()

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

    test('should save the sent claim, not the self-competing response, for a non-quantity action', async () => {
      mockRequest.payload = {
        landAction: ['UPL1', 'UPL2'],
        landActionQuantity_UPL2: '1',
        landActionQuantity_UPL1: '5'
      }
      fetchActionsWithPlannedActions.mockResolvedValue({
        actions: [
          { code: 'UPL1', availability: { unit: 'ha', value: 0 } },
          { code: 'UPL2', availability: { unit: 'ha', value: 2 } }
        ]
      })

      await post()

      expect(fetchActionsForParcel).toHaveBeenCalledTimes(1)
      expect(fetchActionsWithPlannedActions).toHaveBeenCalledWith(
        expect.objectContaining({
          plannedActions: [
            { actionCode: 'UPL1', quantity: 5, unit: 'ha' },
            { actionCode: 'UPL2', quantity: 1, unit: 'ha' }
          ]
        }),
        expect.anything()
      )
      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj.UPL1.value).toBe(5)
    })

    test('should still send the unit for an action with no availability restriction', async () => {
      fetchActionsForParcel.mockResolvedValue({
        actions: [{ ...UPL2, availability: { unit: 'ha', value: null, type: 'partial' } }],
        parcel: { sheetId: 'sheet1', parcelId: 'parcel1', size: { unit: 'ha', value: 20 } }
      })
      mockRequest.payload = { landAction: ['UPL2'], landActionQuantity_UPL2: '7' }
      fetchActionsWithPlannedActions.mockResolvedValue({ actions: [] })

      await post()

      expect(fetchActionsWithPlannedActions).toHaveBeenCalledWith(
        expect.objectContaining({
          plannedActions: [{ actionCode: 'UPL2', quantity: 7, unit: 'ha' }]
        }),
        expect.anything()
      )
      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj.UPL2).toEqual(
        expect.objectContaining({ value: 7, unit: 'ha' })
      )
    })

    test('should keep the original uncompeted actions when the recompute fetch fails', async () => {
      mockRequest.payload = {
        landAction: ['UPL1', 'UPL2'],
        landActionQuantity_UPL2: '1'
      }
      fetchActionsWithPlannedActions.mockRejectedValue(Object.assign(new Error('boom'), { status: 503 }))

      await post()

      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj.UPL1.value).toBe(5)
    })

    test.each([
      ['has no submitted quantity', { landAction: 'UPL2' }],
      ['has a submitted quantity of 0', { landAction: 'UPL2', landActionQuantity_UPL2: '0' }]
    ])('should show an error and not save state when a quantity-required action %s', async (_case, payload) => {
      mockRequest.payload = payload

      await post()

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

    test('should store the submitted quantity override for an action that requires one', async () => {
      mockRequest.payload = {
        landAction: 'UPL2',
        landActionQuantity_UPL2: '1.5'
      }

      await post()

      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj.UPL2.value).toBe(1.5)
    })

    test('should not persist a quantity for an action that does not require one, even if submitted', async () => {
      mockRequest.payload = {
        landAction: 'CMOR1',
        landActionQuantity_CMOR1: '2'
      }

      await post()

      const stateArg = controller.setState.mock.calls[0][1]
      expect(stateArg.landParcels['sheet1-parcel1'].actionsObj.CMOR1.value).toBe(10)
    })

    test('should not save anything to state when no action is selected', async () => {
      mockRequest.payload = { landActionQuantity_UPL2: '1.5' }

      await post()

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: [{ text: 'Select at least one action', href: '#landAction' }]
        })
      )
      expect(controller.setState).not.toHaveBeenCalled()
    })

    test('should show validation errors from API', async () => {
      mockRequest.payload = { landAction: 'CMOR1', action: 'validate' }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'CMOR1', description: 'Invalid area', passed: false }]
      })

      await post()

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: [{ text: 'Invalid area: CMOR1', href: '#landActionQuantity_CMOR1' }]
        })
      )
      expect(controller.proceed).not.toHaveBeenCalled()
    })

    test('should show the recomputed available area in the action hint when application validation fails', async () => {
      mockRequest.payload = {
        landAction: ['UPL1', 'UPL2'],
        landActionQuantity_UPL2: '1',
        landActionQuantity_UPL1: '4',
        action: 'validate'
      }
      fetchActionsWithPlannedActions.mockResolvedValue({
        actions: [
          { code: 'UPL1', availability: { unit: 'ha', value: 4 } },
          { code: 'UPL2', availability: { unit: 'ha', value: 2 } }
        ]
      })
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'UPL2', description: 'Not enough available area', passed: false }]
      })

      await post()

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl2 = actionItems.find((item) => item.value === 'UPL2')

      expect(upl2.html).toContain('2 hectares available')
      expect(upl2.html).not.toContain('3 hectares available')
    })

    test('should link a validation error to the specific action quantity input by code, not position', async () => {
      mockRequest.payload = { landAction: ['CMOR1', 'UPL1'], action: 'validate' }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'UPL1', description: 'Invalid quantity', passed: false }]
      })

      await post()

      expect(mockH.view).toHaveBeenCalledWith(
        'select-actions',
        expect.objectContaining({
          errors: [{ text: 'Invalid quantity: UPL1', href: '#landActionQuantity_UPL1' }]
        })
      )
    })

    test('should keep the just-submitted selections checked when the API validation fails', async () => {
      mockRequest.payload = {
        landAction: ['CMOR1', 'UPL2'],
        landActionQuantity_UPL2: '1.5',
        landActionQuantity_CMOR1: '10',
        action: 'validate'
      }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'UPL2', description: 'Invalid quantity', passed: false }]
      })

      await post()

      const { actionItems } = mockH.view.mock.calls[0][1]
      const cmor1 = actionItems.find((item) => item.value === 'CMOR1')
      const upl2 = actionItems.find((item) => item.value === 'UPL2')

      expect(cmor1.checked).toBe(true)
      expect(upl2.checked).toBe(true)
      expect(upl2.conditional.html).toContain('value="1.5"')
    })

    test('should render data-total-available-area from the static, uncompeted total even after a competing recompute', async () => {
      mockRequest.payload = {
        landAction: ['UPL1', 'UPL2'],
        landActionQuantity_UPL2: '1.5',
        action: 'validate'
      }
      fetchActionsWithPlannedActions.mockResolvedValue({
        actions: [
          { code: 'UPL1', availability: { unit: 'ha', value: 0 } },
          { code: 'UPL2', availability: { unit: 'ha', value: 0 } }
        ]
      })
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'UPL2', description: 'Invalid quantity', passed: false }]
      })

      await post()

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl2 = actionItems.find((item) => item.value === 'UPL2')

      expect(upl2.attributes['data-total-available-area']).toBe(3)
    })

    test('should keep a non-quantity action visible after a failed validation even when unchecked and fully competed away', async () => {
      mockRequest.payload = {
        landAction: 'UPL2',
        landActionQuantity_UPL2: '3',
        action: 'validate'
      }
      fetchActionsWithPlannedActions.mockResolvedValue({
        actions: [
          { code: 'UPL1', availability: { unit: 'ha', value: 0 } },
          { code: 'UPL2', availability: { unit: 'ha', value: 0 } }
        ]
      })
      validateApplication.mockRejectedValue(new Error('API issue'))

      await post()

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl1 = actionItems.find((item) => item.value === 'UPL1')

      expect(upl1).toBeDefined()
      expect(upl1.checked).toBe(false)
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

      await post()

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

      await post()

      const { actionItems } = mockH.view.mock.calls[0][1]
      const upl2 = actionItems.find((item) => item.value === 'UPL2')

      expect(upl2.conditional.html).not.toContain('govuk-input--error')
    })

    test('should keep the just-submitted selections checked when validateApplication throws', async () => {
      mockRequest.payload = {
        landAction: 'CMOR1',
        landActionQuantity_CMOR1: '10',
        action: 'validate'
      }
      validateApplication.mockRejectedValue(new Error('Validation API failed'))

      await post()

      const { actionItems } = mockH.view.mock.calls[0][1]
      expect(actionItems.find((item) => item.value === 'CMOR1').checked).toBe(true)
    })

    test('should return the unauthorized response when the user does not own the selected land parcel', async () => {
      controller.performAuthCheck.mockResolvedValue('failed auth check')

      const result = await post()

      expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, ['sheet1-parcel1'])
      expect(result).toEqual('failed auth check')
    })
  })
})
