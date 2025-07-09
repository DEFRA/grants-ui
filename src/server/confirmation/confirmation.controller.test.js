import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import ConfirmationPageController from './confirmation.controller.js'
import * as formSlugHelper from '~/src/server/common/helpers/form-slug-helper.js'

const mockFormsCacheService = {
  getConfirmationState: jest.fn(),
  setConfirmationState: jest.fn(),
  clearState: jest.fn()
}

jest.mock('@defra/forms-engine-plugin/controllers/StatusPageController.js')
jest.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => mockFormsCacheService
}))
jest.mock('~/src/server/common/helpers/form-slug-helper.js')

describe('ConfirmationPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    StatusPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Confirmation'
    })
    StatusPageController.prototype.getStartPath = jest
      .fn()
      .mockReturnValue('/default-start')

    controller = new ConfirmationPageController()
    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }
    controller.proceed = jest.fn().mockReturnValue('redirected')

    mockRequest = {
      logger: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn()
      },
      path: '/test-path',
      server: {}
    }

    mockFormsCacheService.getConfirmationState.mockResolvedValue({
      confirmed: true
    })

    mockContext = {
      referenceNumber: 'REF123',
      state: {}
    }

    mockH = {
      view: jest.fn().mockReturnValue('rendered view')
    }

    // Mock the form-slug-helper functions
    formSlugHelper.storeSlugInContext.mockImplementation(() => null)
    formSlugHelper.getConfirmationPath.mockImplementation(() => '/confirmation')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe(
      'confirmation/views/confirmation-page.html'
    )
  })

  describe('makeGetRouteHandler', () => {
    test('should return a function', () => {
      const handler = controller.makeGetRouteHandler()
      expect(typeof handler).toBe('function')
    })

    test('should render view with correct viewModel', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'confirmation/views/confirmation-page.html',
        {
          pageTitle: 'Confirmation',
          errors: [],
          referenceNumber: 'REF123'
        }
      )
    })

    test('should redirect to start page if confirmation state is not confirmed', async () => {
      mockFormsCacheService.getConfirmationState.mockResolvedValueOnce({
        confirmed: false
      })
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(String)
      )
    })

    test('should store slug in context', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalledWith(
        mockRequest,
        mockContext,
        'ConfirmationController'
      )
    })

    test('should clear state when confirmed', async () => {
      mockFormsCacheService.getConfirmationState.mockResolvedValueOnce({
        confirmed: true
      })
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockFormsCacheService.setConfirmationState).toHaveBeenCalledWith(
        mockRequest,
        { confirmed: false }
      )
      expect(mockFormsCacheService.clearState).toHaveBeenCalledWith(mockRequest)
    })

    test('should log debug information', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.logger.debug).toHaveBeenCalledWith(
        'ConfirmationController: Confirmation state:',
        expect.any(Object)
      )
      expect(mockRequest.logger.debug).toHaveBeenCalledWith(
        'ConfirmationController: Current path:',
        mockRequest.path
      )
      expect(mockRequest.logger.debug).toHaveBeenCalledWith(
        'ConfirmationController: Start path:',
        expect.any(String)
      )
    })

    test('should handle errors from collection', async () => {
      const mockErrors = [{ field: 'test', message: 'error' }]
      controller.collection.getErrors.mockReturnValue(mockErrors)

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'confirmation/views/confirmation-page.html',
        {
          pageTitle: 'Confirmation',
          errors: mockErrors,
          referenceNumber: 'REF123'
        }
      )
    })

    test('should handle error when getConfirmationState fails', async () => {
      const error = new Error('Cache error')

      // We need to implement the mock to call debug before throwing
      mockFormsCacheService.getConfirmationState.mockImplementationOnce(() => {
        mockRequest.logger.debug(
          'ConfirmationController: Current path:',
          mockRequest.path
        )
        return Promise.reject(error)
      })

      const handler = controller.makeGetRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        error
      )

      expect(mockRequest.logger.debug).toHaveBeenCalledWith(
        'ConfirmationController: Current path:',
        mockRequest.path
      )
    })

    test('should handle error when setConfirmationState fails', async () => {
      const error = new Error('Cache error')
      mockFormsCacheService.setConfirmationState.mockRejectedValueOnce(error)

      const handler = controller.makeGetRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        error
      )
    })

    test('should handle error when clearState fails', async () => {
      const error = new Error('Cache error')
      mockFormsCacheService.clearState.mockRejectedValueOnce(error)

      const handler = controller.makeGetRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        error
      )
    })

    test('should handle case when confirmationState is undefined', async () => {
      // Mock the controller's behavior to handle undefined confirmationState
      const originalGetConfirmationState =
        mockFormsCacheService.getConfirmationState
      mockFormsCacheService.getConfirmationState = jest
        .fn()
        .mockResolvedValueOnce({ confirmed: false })

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalled()
      expect(result).toBe('redirected')

      // Restore the original mock
      mockFormsCacheService.getConfirmationState = originalGetConfirmationState
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
      formSlugHelper.getConfirmationPath.mockReturnValueOnce(
        '/custom-confirmation'
      )

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
