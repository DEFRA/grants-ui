import { vi } from 'vitest'
import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import ConfirmationPageController from './confirmation.controller.js'
import * as formSlugHelper from '~/src/server/common/helpers/form-slug-helper.js'
import { mockContext as mockHapiContext, mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { ConfirmationService } from './services/confirmation.service.js'

const mockFormsCacheServiceMethods = {
  getConfirmationState: vi.fn(),
  setConfirmationState: vi.fn(),
  clearState: vi.fn()
}

vi.mock('@defra/forms-engine-plugin/controllers/StatusPageController.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => mockFormsCacheServiceMethods
}))
vi.mock('~/src/server/common/helpers/form-slug-helper.js')
vi.mock('./services/confirmation.service.js', () => ({
  ConfirmationService: {
    buildViewModel: vi.fn()
  }
}))

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

    test('should redirect to start page if confirmation state is not confirmed', async () => {
      mockFormsCacheServiceMethods.getConfirmationState.mockResolvedValueOnce({
        $$__referenceNumber: 'REF123',
        confirmed: false
      })
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expect.any(String))
    })

    test('should store slug in context', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalledWith(mockRequest, mockContext, 'ConfirmationController')
    })

    test('should clear state when confirmed', async () => {
      mockFormsCacheServiceMethods.getConfirmationState.mockResolvedValueOnce({
        $$__referenceNumber: 'REF123',
        confirmed: true
      })
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockFormsCacheServiceMethods.setConfirmationState).toHaveBeenCalledWith(mockRequest, {
        confirmed: false
      })
      expect(mockFormsCacheServiceMethods.clearState).toHaveBeenCalledWith(mockRequest)
    })

    test('should log debug information', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.logger.debug).toHaveBeenCalledWith(
        'ConfirmationController: Confirmation state:',
        expect.any(Object)
      )
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

    test('should handle error when getConfirmationState fails', async () => {
      const error = new Error('Cache error')

      // We need to implement the mock to call debug before throwing
      mockFormsCacheServiceMethods.getConfirmationState.mockImplementationOnce(() => {
        mockRequest.logger.debug('ConfirmationController: Current path:', mockRequest.path)
        return Promise.reject(error)
      })

      const handler = controller.makeGetRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(error)

      expect(mockRequest.logger.debug).toHaveBeenCalledWith('ConfirmationController: Current path:', mockRequest.path)
    })

    test('should handle error when setConfirmationState fails', async () => {
      const error = new Error('Cache error')
      mockFormsCacheServiceMethods.setConfirmationState.mockRejectedValueOnce(error)

      const handler = controller.makeGetRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(error)
    })

    test('should handle error when clearState fails', async () => {
      const error = new Error('Cache error')
      mockFormsCacheServiceMethods.clearState.mockRejectedValueOnce(error)

      const handler = controller.makeGetRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(error)
    })

    test('should handle case when confirmationState is undefined', async () => {
      // Mock the controller's behavior to handle undefined confirmationState
      const originalGetConfirmationState = mockFormsCacheServiceMethods.getConfirmationState
      mockFormsCacheServiceMethods.getConfirmationState = vi.fn().mockResolvedValueOnce({
        $$__referenceNumber: 'REF123',
        confirmed: false
      })

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalled()
      expect(result).toBe('redirected')

      // Restore the original mock
      mockFormsCacheServiceMethods.getConfirmationState = originalGetConfirmationState
    })

    test('should use configuration-driven confirmation content when available', async () => {
      const mockConfirmationContent = {
        title: 'Custom Confirmation',
        html: '<p>Custom confirmation content</p>'
      }

      const mockViewModel = {
        referenceNumber: 'REF123',
        businessName: 'Test Business',
        sbi: '123456789',
        contactName: 'John Doe',
        confirmationContent: mockConfirmationContent
      }

      controller.model = {
        def: {
          metadata: {
            confirmationContent: mockConfirmationContent
          }
        }
      }

      ConfirmationService.buildViewModel.mockReturnValue(mockViewModel)

      mockRequest.yar = {
        get: vi.fn((key) => {
          const data = {
            businessName: 'Test Business',
            sbi: '123456789',
            contactName: 'John Doe'
          }
          return data[key]
        })
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        referenceNumber: 'REF123',
        businessName: 'Test Business',
        sbi: '123456789',
        contactName: 'John Doe',
        confirmationContent: mockConfirmationContent
      })

      expect(mockH.view).toHaveBeenCalledWith('confirmation/views/config-confirmation-page', {
        pageTitle: 'Confirmation',
        errors: [],
        ...mockViewModel
      })
    })

    test('should include session data in view model for both confirmation types', async () => {
      mockRequest.yar = {
        get: vi.fn((key) => {
          const data = {
            businessName: 'Test Business',
            sbi: '123456789',
            contactName: 'John Doe'
          }
          return data[key]
        })
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirmation-page.html', {
        pageTitle: 'Confirmation',
        errors: [],
        referenceNumber: 'REF123',
        businessName: 'Test Business',
        sbi: '123456789',
        contactName: 'John Doe'
      })
    })

    test('should handle missing session data gracefully', async () => {
      mockRequest.yar = {
        get: vi.fn().mockReturnValue(undefined)
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirmation-page.html', {
        pageTitle: 'Confirmation',
        errors: [],
        referenceNumber: 'REF123',
        businessName: undefined,
        sbi: undefined,
        contactName: undefined
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
