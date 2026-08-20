import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  fetchGroupedActionsForParcel,
  fetchParcels,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import SelectActionsBasePageController from './select-actions-base-page.controller.js'
import {
  CMOR1,
  PARCELS_WITH_SIZE,
  USER_CONTEXT,
  makeLandGrantsRequest,
  makeViewToolkit,
  mockFormatParcelImplementations,
  stubControllerMethods
} from '~/src/server/land-grants/test-helpers.js'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', async () => {
  const { makeQuestionPageControllerMock } = await import('~/src/__mocks__')
  return makeQuestionPageControllerMock('stub-view')
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

/**
 * Minimal concrete subclass exercising only the base class's shared orchestration.
 * Page-specific hook behaviour (view-model shape, validator wording, href format)
 * is covered by the two real subclasses' own test suites, not duplicated here.
 */
class StubSelectActionsController extends SelectActionsBasePageController {
  viewName = 'stub-view'
  fetchActionsService = fetchGroupedActionsForParcel
  validateUserInputResult = []
  writeActionsToStateResult = { landParcels: { 'sheet1-parcel1': { actionsObj: {} } } }

  getViewModelWithActions(
    request,
    context,
    groupedActions,
    addedActions,
    quantityErrorsByCode = {},
    hasErrors = false
  ) {
    return { ...super.getViewModel(request, context), groupedActions, addedActions, quantityErrorsByCode, hasErrors }
  }

  validateUserInput() {
    return this.validateUserInputResult
  }

  buildValidationErrors(payload, failedMessages) {
    return failedMessages.map((e) => ({ text: e.description, href: e.code ? `#${e.code}` : undefined }))
  }

  extractSelectedActionCodes(payload) {
    return Object.keys(payload)
  }

  writeActionsToState() {
    return this.writeActionsToStateResult
  }
}

const mockGroupedActions = [{ name: 'Assess moorland', actions: [CMOR1] }]

describe('SelectActionsBasePageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({ pageTitle: 'Stub page' })

    const mockModel = { def: { metadata: {} }, getSection: vi.fn(), pages: [] }
    controller = stubControllerMethods(new StubSelectActionsController(mockModel, {}))

    fetchParcels.mockResolvedValue(PARCELS_WITH_SIZE.slice(0, 1))

    mockRequest = makeLandGrantsRequest({
      payload: { CMOR1: 'CMOR1' },
      query: { parcelId: 'sheet1-parcel1' }
    })
    mockContext = { state: {}, referenceNumber: 'REF123' }
    mockH = makeViewToolkit()

    mockFormatParcelImplementations()
    fetchGroupedActionsForParcel.mockResolvedValue({
      actions: mockGroupedActions,
      parcel: { parcelId: 'parcel1', sheetId: 'sheet1', size: 10 }
    })
    validateApplication.mockResolvedValue({ valid: true, errorMessages: [] })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('unimplemented hooks', () => {
    test.each([
      ['getViewModelWithActions', () => new SelectActionsBasePageController({ def: {} }, {}).getViewModelWithActions()],
      ['validateUserInput', () => new SelectActionsBasePageController({ def: {} }, {}).validateUserInput()],
      ['writeActionsToState', () => new SelectActionsBasePageController({ def: {} }, {}).writeActionsToState()],
      ['buildValidationErrors', () => new SelectActionsBasePageController({ def: {} }, {}).buildValidationErrors()],
      [
        'extractSelectedActionCodes',
        () => new SelectActionsBasePageController({ def: {} }, {}).extractSelectedActionCodes()
      ]
    ])('%s throws when not overridden by a subclass', (name, invoke) => {
      expect(invoke).toThrow(`must implement ${name}()`)
    })
  })

  describe('GET route handler', () => {
    test('redirects to /select-land-parcel when no parcel is selected', async () => {
      mockRequest.query = {}

      await controller.handleGet(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/select-land-parcel')
    })

    test('renders an error view when fetching actions fails', async () => {
      fetchGroupedActionsForParcel.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))

      await controller.handleGet(mockRequest, mockContext, mockH)

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.errors[0].text).toContain('Unable to find actions information')
    })

    test('renders the success view with actions fetched for the parcel', async () => {
      await controller.handleGet(mockRequest, mockContext, mockH)

      expect(fetchGroupedActionsForParcel).toHaveBeenCalledWith(
        { parcelId: 'parcel1', sheetId: 'sheet1', enabledLandActions: [], plannedActions: [] },
        USER_CONTEXT
      )
      const [viewName, viewModel] = mockH.view.mock.calls[0]
      expect(viewName).toBe('stub-view')
      expect(viewModel.groupedActions).toEqual(mockGroupedActions)
      expect(viewModel.errors).toEqual([])
    })
  })

  describe('POST route handler', () => {
    test('delegates validation to validateUserInput and re-renders with errors when invalid', async () => {
      controller.validateUserInputResult = [{ text: 'Select an action', href: '#field' }]

      await controller.handlePost(mockRequest, mockContext, mockH)

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.errors).toEqual([{ text: 'Select an action', href: '#field' }])
      expect(controller.setState).not.toHaveBeenCalled()
    })

    test('passes hasErrors=true to getViewModelWithActions when re-rendering with errors', async () => {
      controller.validateUserInputResult = [{ text: 'Select an action', href: '#field' }]

      await controller.handlePost(mockRequest, mockContext, mockH)

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.hasErrors).toBe(true)
    })

    test('derives quantityErrorsByCode from quantity-validation errors so the offending input is highlighted', async () => {
      controller.validateActionQuantities = () => [
        { text: 'Quantity for Assess moorland must be 4 decimal places or fewer', href: '#CMOR1', code: 'CMOR1' }
      ]

      await controller.handlePost(mockRequest, mockContext, mockH)

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.quantityErrorsByCode).toEqual({
        CMOR1: 'Quantity for Assess moorland must be 4 decimal places or fewer'
      })
      expect(controller.setState).not.toHaveBeenCalled()
    })

    test('delegates state writing to writeActionsToState and proceeds on success', async () => {
      await controller.handlePost(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, controller.writeActionsToStateResult)
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
    })

    test('runs application validation via buildValidationErrors when action is "validate"', async () => {
      mockRequest.payload = { ...mockRequest.payload, action: 'validate' }
      validateApplication.mockResolvedValue({
        valid: false,
        errorMessages: [{ code: 'CMOR1', description: 'Too much land', passed: false }]
      })

      await controller.handlePost(mockRequest, mockContext, mockH)

      expect(validateApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: 'REF123',
          crn: 'CRN123'
        }),
        USER_CONTEXT
      )
      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.errors).toEqual([{ text: 'Too much land', href: '#CMOR1' }])
      expect(controller.setState).not.toHaveBeenCalled()
    })

    test('proceeds without re-validating when application validation passes', async () => {
      mockRequest.payload = { ...mockRequest.payload, action: 'validate' }

      await controller.handlePost(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalled()
    })

    test('renders an error view and logs when application validation throws', async () => {
      mockRequest.payload = { ...mockRequest.payload, action: 'validate' }
      validateApplication.mockRejectedValue(Object.assign(new Error('network down'), { status: 502 }))

      await controller.handlePost(mockRequest, mockContext, mockH)

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.errors[0].text).toContain('issue validating the application')
      expect(controller.setState).not.toHaveBeenCalled()
    })
  })
})
