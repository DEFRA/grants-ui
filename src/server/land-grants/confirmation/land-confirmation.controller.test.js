import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import LandConfirmationPageController from './land-confirmation.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/StatusPageController.js')

describe('LandConfirmationPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    StatusPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Confirmation'
    })

    controller = new LandConfirmationPageController()
    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }

    mockRequest = {
      logger: {
        error: jest.fn()
      }
    }

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
