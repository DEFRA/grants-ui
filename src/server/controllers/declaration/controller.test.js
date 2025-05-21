import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import DeclarationPageController from './controller.js'
import * as formSlugHelper from '~/src/server/common/helpers/form-slug-helper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application.service.js'
import { transformStateObjectToGasApplication } from '../../common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { transformAnswerKeysToText } from './state-to-gas-answers-mapper.js'

const mockCacheService = {
  getConfirmationState: jest.fn().mockResolvedValue({ confirmed: true }),
  setConfirmationState: jest.fn(),
  clearState: jest.fn()
}

jest.mock('~/src/server/common/helpers/form-slug-helper.js')
jest.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => mockCacheService
}))
jest.mock(
  '@defra/forms-engine-plugin/controllers/SummaryPageController.js',
  () => {
    return {
      SummaryPageController: class {
        constructor(model, pageDef) {
          this.model = model
          this.pageDef = pageDef
        }
      }
    }
  }
)
jest.mock('~/src/server/common/services/grant-application.service.js')
jest.mock(
  '../../common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
)
jest.mock('./state-to-gas-answers-mapper.js')

describe('DeclarationPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH
  let mockModel
  let mockPageDef
  let parentGetHandler

  beforeEach(() => {
    mockModel = {
      def: {
        metadata: {
          submission: {
            grantCode: 'adding-value'
          }
        }
      },
      componentDefMap: {},
      listDefMap: {}
    }
    mockPageDef = {}

    // Mock the parent's GET handler
    parentGetHandler = jest.fn().mockImplementation(() => {
      return Promise.resolve('parent handler response')
    })
    SummaryPageController.prototype.makeGetRouteHandler = jest
      .fn()
      .mockReturnValue(parentGetHandler)

    controller = new DeclarationPageController(mockModel, mockPageDef)

    mockRequest = {
      payload: {
        declaration: true
      },
      logger: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn()
      },
      params: {
        slug: 'adding-value'
      },
      path: '/adding-value/declaration',
      server: {}
    }

    mockContext = {
      relevantState: {
        referenceNumber: 'REF123',
        field1: 'value1'
      },
      referenceNumber: 'REF123'
    }

    mockH = {
      redirect: jest.fn().mockReturnValue('redirected'),
      view: jest.fn().mockReturnValue('rendered view')
    }

    transformAnswerKeysToText.mockReturnValue({ transformedState: true })
    transformStateObjectToGasApplication.mockReturnValue({
      transformedApp: true
    })
    submitGrantApplication.mockResolvedValue({
      clientRef: 'ref123'
    })

    // Mock the form-slug-helper functions
    formSlugHelper.storeSlugInContext.mockImplementation(() => null)
    formSlugHelper.getConfirmationPath.mockImplementation(
      () => '/adding-value/confirmation'
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('declaration-page')
  })

  describe('getStatusPath', () => {
    test('should call getConfirmationPath with correct parameters', () => {
      controller.getStatusPath(mockRequest, mockContext)

      expect(formSlugHelper.getConfirmationPath).toHaveBeenCalledWith(
        mockRequest,
        mockContext,
        'DeclarationController'
      )
    })

    test('should return the result from getConfirmationPath', () => {
      formSlugHelper.getConfirmationPath.mockReturnValueOnce(
        '/test-slug/confirmation'
      )

      const result = controller.getStatusPath(mockRequest, mockContext)

      expect(result).toBe('/test-slug/confirmation')
    })

    test('should handle missing request or context parameters', () => {
      // Test with undefined request
      controller.getStatusPath(undefined, mockContext)
      expect(formSlugHelper.getConfirmationPath).toHaveBeenCalledWith(
        undefined,
        mockContext,
        'DeclarationController'
      )

      // Test with undefined context
      controller.getStatusPath(mockRequest, undefined)
      expect(formSlugHelper.getConfirmationPath).toHaveBeenCalledWith(
        mockRequest,
        undefined,
        'DeclarationController'
      )
    })
  })

  describe('makeGetRouteHandler', () => {
    test('should return a function that wraps the parent handler', () => {
      const handler = controller.makeGetRouteHandler()
      expect(typeof handler).toBe('function')
      expect(
        SummaryPageController.prototype.makeGetRouteHandler
      ).toHaveBeenCalled()
    })

    test('should store slug in context before calling parent handler', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalledWith(
        mockRequest,
        mockContext,
        'DeclarationController'
      )
      expect(parentGetHandler).toHaveBeenCalledWith(
        mockRequest,
        mockContext,
        mockH
      )
    })

    test('should return the result from the parent handler', async () => {
      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(result).toBe('parent handler response')
    })

    test('should handle errors from parent handler', async () => {
      const error = new Error('Parent handler error')
      parentGetHandler.mockRejectedValueOnce(error)

      const handler = controller.makeGetRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        error
      )

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalled()
    })

    test('should handle case when parent handler returns undefined', async () => {
      parentGetHandler.mockResolvedValueOnce(undefined)

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(result).toBeUndefined()
    })
  })

  describe('makePostRouteHandler', () => {
    test('should return a function', () => {
      const handler = controller.makePostRouteHandler()
      expect(typeof handler).toBe('function')
    })

    test('should submit form and redirect on success', async () => {
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalledWith(
        mockRequest,
        mockContext,
        'DeclarationController'
      )
      expect(transformAnswerKeysToText).toHaveBeenCalledWith(
        mockContext.relevantState,
        mockModel.componentDefMap,
        mockModel.listDefMap
      )

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        {
          clientRef: 'ref123', // <- note: in controller, it’s `context.referenceNumber?.toLowerCase()`
          sbi: 'sbi',
          frn: 'frn',
          crn: 'crn',
          defraId: 'defraId'
        },
        { transformedState: true, referenceNumber: 'REF123' },
        expect.any(Function)
      )

      expect(submitGrantApplication).toHaveBeenCalledWith('adding-value', {
        transformedApp: true
      })
      expect(mockCacheService.setConfirmationState).toHaveBeenCalledWith(
        mockRequest,
        { confirmed: true }
      )
      expect(mockH.redirect).toHaveBeenCalledWith('/adding-value/confirmation')
    })

    test('should log debug information during processing', async () => {
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.logger.debug).toHaveBeenCalledWith(
        'DeclarationController: Processing form submission'
      )
      expect(mockRequest.logger.debug).toHaveBeenCalledWith(
        'DeclarationController: Current URL:',
        mockRequest.path
      )
      expect(mockRequest.logger.debug).toHaveBeenCalledWith(
        'DeclarationController: Got reference number:',
        'ref123'
      )
      expect(mockRequest.logger.debug).toHaveBeenCalledWith(
        'DeclarationController: Set confirmation state to true'
      )
      expect(mockRequest.logger.debug).toHaveBeenCalledWith(
        'DeclarationController: Redirecting to:',
        '/adding-value/confirmation'
      )
    })

    test('should log submission details when available', async () => {
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.logger.info).toHaveBeenCalledWith({
        message: 'Form submission completed',
        referenceNumber: 'ref123',
        numberOfSubmittedFields: Object.keys(mockContext.relevantState).length,
        timestamp: expect.any(String)
      })
    })

    test('should handle submission errors', async () => {
      const error = new Error('Submission failed')
      submitGrantApplication.mockRejectedValue(error)

      const handler = controller.makePostRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        error
      )

      expect(mockRequest.logger.error).toHaveBeenCalledWith(
        error,
        'Failed to submit form'
      )
    })

    test('should handle error when setConfirmationState fails', async () => {
      const error = new Error('Cache error')
      mockCacheService.setConfirmationState.mockRejectedValueOnce(error)

      const handler = controller.makePostRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        error
      )

      expect(submitGrantApplication).toHaveBeenCalledWith('adding-value', {
        transformedApp: true
      })
      expect(mockContext.referenceNumber).toBe('REF123')
    })

    test('should handle case when submission result has no referenceNumber', async () => {
      mockContext.referenceNumber = undefined
      submitGrantApplication.mockResolvedValueOnce({
        result: {}
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockContext.referenceNumber).toBeUndefined()
      expect(mockCacheService.setConfirmationState).toHaveBeenCalled()
      expect(mockH.redirect).toHaveBeenCalled()
    })
  })
})
