import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import {
  fetchAvailableActionsForParcel,
  fetchParcels,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import { parseLandParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import SelectActionsBasePageController from './select-actions-base-page.controller.js'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => ({
  QuestionPageController: class {
    getViewModel() {}

    makeGetRouteHandler() {
      return async (request, context, h) => h.view('stub-view', this.getViewModel(request, context))
    }

    makePostRouteHandler() {
      return async (request, context, h) => h.view('stub-view', this.getViewModel(request, context))
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
vi.mock('~/src/server/land-grants/utils/format-parcel.js')

/**
 * Minimal concrete subclass exercising only the base class's shared orchestration.
 * Page-specific hook behaviour (view-model shape, validator wording, href format)
 * is covered by the two real subclasses' own test suites, not duplicated here.
 */
class StubSelectActionsController extends SelectActionsBasePageController {
  viewName = 'stub-view'
  validateUserInputResult = []
  writeActionsToStateResult = { landParcels: { 'sheet1-parcel1': { actionsObj: {} } } }

  getViewModelWithActions(request, context, groupedActions, addedActions, quantityErrorsByCode = {}) {
    return { ...super.getViewModel(request, context), groupedActions, addedActions, quantityErrorsByCode }
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

const mockParcelsResponse = [{ parcelId: '0155', sheetId: 'SD7946', area: { unit: 'ha', value: 4.0383 } }]

const mockGroupedActions = [
  {
    name: 'Assess moorland',
    actions: [{ code: 'CMOR1', description: 'Assess moorland: CMOR1', availableArea: { unit: 'ha', value: 10 } }]
  }
]

describe('SelectActionsBasePageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({ pageTitle: 'Stub page' })

    const mockModel = { def: { metadata: {} }, getSection: vi.fn(), pages: [] }
    controller = new StubSelectActionsController(mockModel, {})
    controller.collection = { getErrors: vi.fn().mockReturnValue([]) }
    controller.setState = vi.fn().mockResolvedValue(true)
    controller.proceed = vi.fn().mockReturnValue('redirected')
    controller.getNextPath = vi.fn().mockReturnValue('/next-path')
    controller.performAuthCheck = vi.fn().mockResolvedValue(null)

    fetchParcels.mockResolvedValue(mockParcelsResponse)

    mockRequest = {
      payload: { CMOR1: 'CMOR1' },
      query: { parcelId: 'sheet1-parcel1' },
      logger: mockRequestLogger(),
      auth: {
        isAuthenticated: true,
        credentials: { token: 'defra-id-access-token', sbi: '106284736', crn: 'CRN123' }
      }
    }
    mockContext = { state: {}, referenceNumber: 'REF123' }
    mockH = { view: vi.fn().mockReturnValue('rendered view'), redirect: vi.fn() }

    parseLandParcel.mockReturnValue(['sheet1', 'parcel1'])
    fetchAvailableActionsForParcel.mockResolvedValue({
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
      fetchAvailableActionsForParcel.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))

      await controller.handleGet(mockRequest, mockContext, mockH)

      const [, viewModel] = mockH.view.mock.calls[0]
      expect(viewModel.errors[0].text).toContain('Unable to find actions information')
    })

    test('renders the success view with actions fetched for the parcel', async () => {
      await controller.handleGet(mockRequest, mockContext, mockH)

      expect(fetchAvailableActionsForParcel).toHaveBeenCalledWith(
        { parcelId: 'parcel1', sheetId: 'sheet1', enabledLandActions: [] },
        { defraIdToken: 'defra-id-access-token', sbi: '106284736' }
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
        { defraIdToken: 'defra-id-access-token', sbi: '106284736' }
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
