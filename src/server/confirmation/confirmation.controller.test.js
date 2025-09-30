import { vi } from 'vitest'
import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import ConfirmationPageController from './confirmation.controller.js'
import * as formSlugHelper from '~/src/server/common/helpers/form-slug-helper.js'
import { mockContext as mockHapiContext, mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

const mockFormsCacheServiceMethods = {
  getConfirmationState: vi.fn(),
  setConfirmationState: vi.fn(),
  clearState: vi.fn(),
  getState: vi.fn().mockReturnValue({
    $$__referenceNumber: 'REF123',
    applicationStatus: 'SUBMITTED'
  })
}

vi.mock('@defra/forms-engine-plugin/controllers/StatusPageController.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => mockFormsCacheServiceMethods
}))
vi.mock('~/src/server/common/helpers/form-slug-helper.js')

describe('ConfirmationPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    StatusPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Confirmation'
    })
    StatusPageController.prototype.getStartPath = vi.fn().mockReturnValue('/default-start')

    controller = new ConfirmationPageController()
    controller.collection = {
      getErrors: vi.fn().mockReturnValue([])
    }
    controller.proceed = vi.fn().mockReturnValue('redirected')

    mockRequest = mockHapiRequest({
      path: '/test-path',
      server: {}
    })

    mockFormsCacheServiceMethods.getConfirmationState.mockResolvedValue({
      $$__referenceNumber: 'REF123',
      confirmed: true
    })

    mockContext = mockHapiContext({
      referenceNumber: 'REF123',
      state: {}
    })

    mockH = mockHapiResponseToolkit({
      view: vi.fn().mockReturnValue('rendered view')
    })

    // Mock the form-slug-helper functions
    formSlugHelper.storeSlugInContext.mockImplementation(() => null)
    formSlugHelper.getConfirmationPath.mockImplementation(() => '/confirmation')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('confirmation-page.html')
  })

  describe('makeGetRouteHandler', () => {
    test('should return a function', () => {
      const handler = controller.makeGetRouteHandler()
      expect(typeof handler).toBe('function')
    })

    test('should render view with correct viewModel', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirmation-page.html', {
        pageTitle: 'Confirmation',
        errors: [],
        referenceNumber: 'REF123'
      })
    })

    test('should store slug in context', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalledWith(mockRequest, mockContext, 'ConfirmationController')
    })

    test('should log debug information', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.logger.debug).toHaveBeenCalledWith('ConfirmationController: State:', expect.any(Object))
      expect(mockRequest.logger.debug).toHaveBeenCalledWith('ConfirmationController: Current path:', mockRequest.path)
      expect(mockRequest.logger.debug).toHaveBeenCalledWith('ConfirmationController: Start path:', expect.any(String))
    })

    test('should handle errors from collection', async () => {
      const mockErrors = [{ field: 'test', message: 'error' }]
      controller.collection.getErrors.mockReturnValue(mockErrors)

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirmation-page.html', {
        pageTitle: 'Confirmation',
        errors: mockErrors,
        referenceNumber: 'REF123'
      })
    })
  })

  describe('getStatusPath', () => {
    test('should call getConfirmationPath with correct parameters', () => {
      controller.getStatusPath(mockRequest, mockContext)

      expect(formSlugHelper.getConfirmationPath).toHaveBeenCalledWith(
        mockRequest,
        mockContext,
        'ConfirmationController'
      )
    })

    test('should return the result from getConfirmationPath', () => {
      formSlugHelper.getConfirmationPath.mockReturnValueOnce('/custom-confirmation')

      const result = controller.getStatusPath(mockRequest, mockContext)

      expect(result).toBe('/custom-confirmation')
    })
  })

  describe('getStartPath', () => {
    test('should return default path when no slug exists', () => {
      // Ensure controller.model.def.metadata.slug is undefined
      controller.model = {
        def: {
          metadata: {}
        }
      }

      const result = controller.getStartPath()

      expect(StatusPageController.prototype.getStartPath).toHaveBeenCalled()
      expect(result).toBe('/default-start')
    })

    test('should return slug-based path when slug exists', () => {
      // Set up model with a slug
      controller.model = {
        def: {
          metadata: {
            slug: 'test-form'
          }
        }
      }

      const result = controller.getStartPath()

      expect(result).toBe('/test-form/start')
    })

    test('should handle case when model is undefined', () => {
      controller.model = undefined

      const result = controller.getStartPath()

      expect(StatusPageController.prototype.getStartPath).toHaveBeenCalled()
      expect(result).toBe('/default-start')
    })

    test('should handle case when model.def is undefined', () => {
      controller.model = {}

      const result = controller.getStartPath()

      expect(StatusPageController.prototype.getStartPath).toHaveBeenCalled()
      expect(result).toBe('/default-start')
    })

    test('should handle case when model.def.metadata is undefined', () => {
      controller.model = { def: {} }

      const result = controller.getStartPath()

      expect(StatusPageController.prototype.getStartPath).toHaveBeenCalled()
      expect(result).toBe('/default-start')
    })
  })
})
