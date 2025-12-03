import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import * as formSlugHelper from '~/src/server/common/helpers/form-slug-helper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import DeclarationPageController from './declaration-page.controller.js'
import { transformAnswerKeysToText } from './state-to-gas-answers-mapper.js'
import { vi } from 'vitest'
import { mockFormsCacheService, mockHapiRequest } from '~/src/__mocks__'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { handleGasApiError } from '~/src/server/common/helpers/gas-error-messages.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'

vi.mock('~/src/server/common/helpers/gas-error-messages.js')
vi.mock('../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

const mockCacheService = mockFormsCacheService({
  getState: vi.fn().mockReturnValue({
    $$__referenceNumber: 'REF123'
  }),
  setState: vi.fn()
}).getFormsCacheService()
vi.mock('~/src/server/common/helpers/form-slug-helper.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => mockCacheService
}))
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () => {
  return {
    SummaryPageController: class {
      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
      }
    }
  }
})
vi.mock('~/src/server/common/services/grant-application/grant-application.service.js')
vi.mock('~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js')
vi.mock('./state-to-gas-answers-mapper.js')

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
      listDefIdMap: {}
    }
    mockPageDef = {}

    // Mock the parent's GET handler
    parentGetHandler = vi.fn().mockImplementation(() => {
      return Promise.resolve('parent handler response')
    })
    SummaryPageController.prototype.makeGetRouteHandler = vi.fn().mockReturnValue(parentGetHandler)

    controller = new DeclarationPageController(mockModel, mockPageDef)

    mockRequest = mockHapiRequest({
      payload: {
        declaration: true
      },
      params: {
        slug: 'adding-value'
      },
      path: '/adding-value/declaration',
      server: {},
      auth: {
        credentials: {
          sbi: 'sbi123',
          crn: '1234567890'
        }
      }
    })

    mockContext = {
      relevantState: {
        referenceNumber: 'REF123',
        field1: 'value1'
      },
      referenceNumber: 'REF123'
    }

    mockH = {
      redirect: vi.fn().mockReturnValue('redirected'),
      view: vi.fn().mockReturnValue('rendered view')
    }

    transformAnswerKeysToText.mockReturnValue({ transformedState: true })
    transformStateObjectToGasApplication.mockReturnValue({
      transformedApp: true,
      metadata: {
        submittedAt: '2025-01-01T00:00:00.000Z'
      }
    })
    submitGrantApplication.mockResolvedValue({
      status: statusCodes.noContent
    })

    // Mock the form-slug-helper functions
    formSlugHelper.storeSlugInContext.mockImplementation(() => null)
    formSlugHelper.getConfirmationPath.mockImplementation(() => '/adding-value/confirmation')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('declaration-page.html')
  })

  describe('getStatusPath', () => {
    test('should call getConfirmationPath with correct parameters', () => {
      controller.getStatusPath(mockRequest, mockContext)

      expect(formSlugHelper.getConfirmationPath).toHaveBeenCalledWith(mockRequest, mockContext, 'DeclarationController')
    })

    test('should return the result from getConfirmationPath', () => {
      formSlugHelper.getConfirmationPath.mockReturnValueOnce('/test-slug/confirmation')

      const result = controller.getStatusPath(mockRequest, mockContext)

      expect(result).toBe('/test-slug/confirmation')
    })

    test('should handle missing request or context parameters', () => {
      // Test with undefined request
      controller.getStatusPath(undefined, mockContext)
      expect(formSlugHelper.getConfirmationPath).toHaveBeenCalledWith(undefined, mockContext, 'DeclarationController')

      // Test with undefined context
      controller.getStatusPath(mockRequest, undefined)
      expect(formSlugHelper.getConfirmationPath).toHaveBeenCalledWith(mockRequest, undefined, 'DeclarationController')
    })
  })

  describe('makeGetRouteHandler', () => {
    test('should return a function that wraps the parent handler', () => {
      const handler = controller.makeGetRouteHandler()
      expect(typeof handler).toBe('function')
      expect(SummaryPageController.prototype.makeGetRouteHandler).toHaveBeenCalled()
    })

    test('should store slug in context before calling parent handler', async () => {
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalledWith(mockRequest, mockContext, 'DeclarationController')
      expect(parentGetHandler).toHaveBeenCalledWith(mockRequest, mockContext, mockH)
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
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(error)

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

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalledWith(mockRequest, mockContext, 'DeclarationController')
      expect(transformAnswerKeysToText).toHaveBeenCalledWith(
        mockContext.relevantState,
        mockModel.componentDefMap,
        mockModel.listDefIdMap
      )

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        {
          clientRef: 'ref123',
          sbi: 'sbi123',
          frn: 'frn',
          crn: '1234567890',
          defraId: 'defraId'
        },
        { transformedState: true, referenceNumber: 'REF123' },
        expect.any(Function)
      )

      expect(submitGrantApplication).toHaveBeenCalledWith(
        'adding-value',
        {
          transformedApp: true,
          metadata: {
            submittedAt: '2025-01-01T00:00:00.000Z'
          }
        },
        mockRequest
      )
      expect(mockH.redirect).toHaveBeenCalledWith('/adding-value/confirmation')
    })

    test('should log debug information during processing', async () => {
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_PROCESSING,
        { controller: 'DeclarationController', path: mockRequest.path },
        mockRequest
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.APPLICATION_STATUS_UPDATED,
        { controller: 'DeclarationController', status: 'SUBMITTED' },
        mockRequest
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_REDIRECT,
        { controller: 'DeclarationController', redirectPath: '/adding-value/confirmation' },
        mockRequest
      )
    })

    test('should log submission details when available', async () => {
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_COMPLETED,
        {
          grantType: 'adding-value',
          referenceNumber: 'REF123',
          numberOfFields: Object.keys(mockContext.relevantState).length,
          status: 'success'
        },
        mockRequest
      )
    })

    test('should handle submission errors', async () => {
      const error = new Error('Submission failed')
      submitGrantApplication.mockRejectedValue(error)

      const handler = controller.makePostRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(error)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_FAILURE,
        expect.objectContaining({
          grantType: 'adding-value',
          referenceNumber: 'REF123',
          sbi: 'sbi123',
          crn: '1234567890',
          errorMessage: 'Submission failed'
        }),
        mockRequest
      )
    })

    test('should handle GrantApplicationServiceApiError and show custom error page', async () => {
      const gasError = new Error('GAS API Error')
      gasError.name = 'GrantApplicationServiceApiError'
      gasError.status = 429
      submitGrantApplication.mockRejectedValue(gasError)

      const mockErrorView = {
        code: vi.fn().mockReturnThis()
      }
      mockH.view = vi.fn().mockReturnValue(mockErrorView)
      handleGasApiError.mockReturnValue(mockErrorView)

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_FAILURE,
        expect.objectContaining({
          grantType: 'adding-value',
          referenceNumber: 'REF123',
          sbi: 'sbi123',
          crn: '1234567890',
          errorMessage: 'GAS API Error'
        }),
        mockRequest
      )
      expect(handleGasApiError).toHaveBeenCalledWith(mockH, mockContext, gasError)
      expect(result).toBe(mockErrorView)
    })

    test('should re-throw non-GAS errors', async () => {
      const error = new Error('Some other error')
      error.name = 'SomeOtherError'
      submitGrantApplication.mockRejectedValue(error)

      const handler = controller.makePostRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(error)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_FAILURE,
        expect.objectContaining({
          grantType: 'adding-value',
          referenceNumber: 'REF123',
          sbi: 'sbi123',
          crn: '1234567890',
          errorMessage: 'Some other error'
        }),
        mockRequest
      )
      expect(handleGasApiError).not.toHaveBeenCalled()
    })
  })
})
