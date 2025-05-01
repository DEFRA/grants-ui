import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import ConfirmationPageController from './controller.js'

const mockFormsCacheService = {
  getConfirmationState: jest.fn(),
  setConfirmationState: jest.fn(),
  clearState: jest.fn()
}

jest.mock('@defra/forms-engine-plugin/controllers/StatusPageController.js')
jest.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => mockFormsCacheService
}))

describe('ConfirmationPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    StatusPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Confirmation'
    })

    controller = new ConfirmationPageController()
    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }
    controller.proceed = jest.fn().mockReturnValue('redirected')
    controller.getStartPath = jest.fn().mockReturnValue('/start')

    mockRequest = {
      logger: {
        error: jest.fn()
      }
    }

    mockFormsCacheService.getConfirmationState.mockResolvedValue({
      confirmed: true
    })

    mockContext = {
      referenceNumber: 'REF123'
    }

    mockH = {
      view: jest.fn().mockReturnValue('rendered view')
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('confirmation-page')
  })

  describe('makeGetRouteHandler', () => {
    test('should return a function', () => {
      const handler = controller.makeGetRouteHandler()
      expect(typeof handler).toBe('function')
    })

    test('should render view with correct viewModel', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirmation-page', {
        pageTitle: 'Confirmation',
        errors: [],
        referenceNumber: 'REF123'
      })
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
        '/start'
      )
    })

    test('should handle errors from collection', async () => {
      const mockErrors = [{ field: 'test', message: 'error' }]
      controller.collection.getErrors.mockReturnValue(mockErrors)

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirmation-page', {
        pageTitle: 'Confirmation',
        errors: mockErrors,
        referenceNumber: 'REF123'
      })
    })
  })

  describe('getStatusPath', () => {
    test('should return the correct path', () => {
      expect(controller.getStatusPath()).toBe('/confirmation')
    })
  })
})
