import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import * as formSlugHelper from '~/src/server/common/helpers/form-slug-helper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import DeclarationPageController from './declaration-page.controller.js'
import { vi } from 'vitest'
import { mockHapiRequest } from '~/src/__mocks__'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { handleGasApiError } from '~/src/server/common/helpers/gas-error-messages.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { getTaskPageBackLink } from '~/src/server/task-list/task-list.helper.js'

vi.mock('~/src/server/common/helpers/gas-error-messages.js')
vi.mock('../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

const mockCacheService = {
  getState: vi.fn().mockReturnValue({
    $$__referenceNumber: 'REF123'
  }),
  setState: vi.fn()
}
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

      getSummaryViewModel(request, context) {
        return {
          serviceUrl: '/service',
          page: {
            title: 'Summary'
          }
        }
      }
    }
  }
})
vi.mock('~/src/server/common/services/grant-application/grant-application.service.js')
vi.mock('~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js')
vi.mock('~/src/server/task-list/task-list.helper.js', () => ({
  getTaskPageBackLink: vi.fn()
}))

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
            grantCode: 'example-grant-with-auth'
          }
        }
      },
      componentDefMap: {},
      listDefIdMap: {},
      getSection: (id) => ({ id: '79d03fa4-bf5b-4a78-8f6e-eb94bab7a5c4', title: 'Example Section' })
    }
    mockPageDef = {
      section: '79d03fa4-bf5b-4a78-8f6e-eb94bab7a5c4'
    }

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
        slug: 'example-grant-with-auth'
      },
      path: '/example-grant-with-auth/declaration',
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
      referenceNumber: 'REF123',
      state: {
        previousReferenceNumber: 'REF345'
      },
      payload: {
        declaration: true
      }
    }

    mockH = {
      redirect: vi.fn().mockReturnValue('redirected'),
      view: vi.fn().mockReturnValue('rendered view')
    }

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
    formSlugHelper.getConfirmationPath.mockImplementation(() => '/example-grant-with-auth/confirmation')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    test('should set viewName to declaration-page.html', () => {
      expect(controller.viewName).toBe('declaration-page.html')
    })

    test('should override viewName when pageDef.view is provided', () => {
      const pageDefWithView = { ...mockPageDef, view: 'custom-view.html' }
      const controllerWithView = new DeclarationPageController(mockModel, pageDefWithView)
      expect(controllerWithView.viewName).toBe('custom-view.html')
    })

    test('should keep default viewName when pageDef.view is not provided', () => {
      const pageDefWithoutView = { ...mockPageDef }
      const controllerWithoutView = new DeclarationPageController(mockModel, pageDefWithoutView)
      expect(controllerWithoutView.viewName).toBe('declaration-page.html')
    })

    test('should set model property', () => {
      expect(controller.model).toBe(mockModel)
    })

    test('should resolve section when pageDef has section property', () => {
      const getSectionSpy = vi.spyOn(mockModel, 'getSection')
      const controllerWithSection = new DeclarationPageController(mockModel, mockPageDef)
      expect(controllerWithSection.section).toEqual({
        id: '79d03fa4-bf5b-4a78-8f6e-eb94bab7a5c4',
        title: 'Example Section'
      })
      expect(getSectionSpy).toHaveBeenCalledWith('79d03fa4-bf5b-4a78-8f6e-eb94bab7a5c4')
    })

    test('should not resolve section when pageDef has no section property', () => {
      const pageDefWithoutSection = {}
      const controllerWithoutSection = new DeclarationPageController(mockModel, pageDefWithoutSection)
      expect(controllerWithoutSection.section).toBeUndefined()
    })

    test('should call parent constructor', () => {
      const controllerInstance = new DeclarationPageController(mockModel, mockPageDef)
      expect(controllerInstance.pageDef).toBe(mockPageDef)
    })
  })

  describe('getSummaryViewModel', () => {
    test('should call parent getSummaryViewModel and add section title', () => {
      const result = controller.getSummaryViewModel(mockRequest, mockContext)

      expect(result.serviceUrl).toBe('/service')
      expect(result.page.title).toBe('Summary')
      expect(result.sectionTitle).toBe('Example Section')
    })

    test('should include backLink when getTaskPageBackLink returns a value', () => {
      getTaskPageBackLink.mockReturnValue({ href: '/task-list', text: 'Back to task list' })

      const result = controller.getSummaryViewModel(mockRequest, mockContext)

      expect(getTaskPageBackLink).toHaveBeenCalledWith(
        {
          serviceUrl: '/service',
          page: {
            title: 'Summary'
          }
        },
        mockPageDef
      )
      expect(result.backLink).toEqual({ href: '/task-list', text: 'Back to task list' })
    })

    test('should not include backLink when getTaskPageBackLink returns null', () => {
      getTaskPageBackLink.mockReturnValue(null)

      const result = controller.getSummaryViewModel(mockRequest, mockContext)

      expect(result.backLink).toBeUndefined()
    })

    test('should not include backLink when getTaskPageBackLink returns undefined', () => {
      getTaskPageBackLink.mockReturnValue(undefined)

      const result = controller.getSummaryViewModel(mockRequest, mockContext)

      expect(result.backLink).toBeUndefined()
    })

    test('should set sectionTitle to empty string when section has hideTitle set to true', () => {
      mockModel.getSection = vi.fn().mockReturnValue({
        id: '79d03fa4-bf5b-4a78-8f6e-eb94bab7a5c4',
        title: 'Example Section',
        hideTitle: true
      })
      const controllerWithHiddenTitle = new DeclarationPageController(mockModel, mockPageDef)

      const result = controllerWithHiddenTitle.getSummaryViewModel(mockRequest, mockContext)

      expect(result.sectionTitle).toBe('')
    })

    test('should set sectionTitle to undefined when section is undefined', () => {
      const pageDefWithoutSection = {}
      const controllerWithoutSection = new DeclarationPageController(mockModel, pageDefWithoutSection)

      const result = controllerWithoutSection.getSummaryViewModel(mockRequest, mockContext)

      expect(result.sectionTitle).toBeUndefined()
    })

    test('should preserve all parent view model properties', () => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue({
        serviceUrl: '/service',
        page: { title: 'Summary' },
        otherProperty: 'value',
        anotherProperty: 123
      })

      const result = controller.getSummaryViewModel(mockRequest, mockContext)

      expect(result.serviceUrl).toBe('/service')
      expect(result.page.title).toBe('Summary')
      expect(result.otherProperty).toBe('value')
      expect(result.anotherProperty).toBe(123)
      expect(result.sectionTitle).toBe('Example Section')
    })
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

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        {
          clientRef: 'ref123',
          previousClientRef: 'ref345',
          sbi: 'sbi123',
          frn: 'undefined',
          crn: '1234567890'
        },
        { referenceNumber: 'REF123', field1: 'value1', declaration: true },
        expect.any(Function)
      )

      expect(submitGrantApplication).toHaveBeenCalledWith(
        'example-grant-with-auth',
        {
          transformedApp: true,
          metadata: {
            submittedAt: '2025-01-01T00:00:00.000Z'
          }
        },
        mockRequest
      )
      expect(mockH.redirect).toHaveBeenCalledWith('/example-grant-with-auth/confirmation')
    })

    test('should not include previousClientRef when previousReferenceNumber is absent', async () => {
      const handler = controller.makePostRouteHandler()

      const contextWithoutPreviousRef = {
        ...mockContext,
        state: {}
      }

      await handler(mockRequest, contextWithoutPreviousRef, mockH)

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        {
          clientRef: 'ref123',
          sbi: 'sbi123',
          frn: 'undefined',
          crn: '1234567890'
        },
        { referenceNumber: 'REF123', field1: 'value1', declaration: true },
        expect.any(Function)
      )
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
        { controller: 'DeclarationController', redirectPath: '/example-grant-with-auth/confirmation' },
        mockRequest
      )
    })

    test('should log submission details when available', async () => {
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_COMPLETED,
        {
          grantType: 'example-grant-with-auth',
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
          grantType: 'example-grant-with-auth',
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
          grantType: 'example-grant-with-auth',
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
          grantType: 'example-grant-with-auth',
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
