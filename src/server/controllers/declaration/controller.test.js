import { formSubmissionService } from '~/src/server/common/forms/services/submission.js'
import DeclarationPageController from './controller.js'
import * as formSlugHelper from '~/src/server/common/helpers/form-slug-helper.js'

jest.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js')
jest.mock('~/src/server/common/forms/services/submission.js')
jest.mock('~/src/server/common/helpers/form-slug-helper.js')
jest.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => ({
    getConfirmationState: jest.fn().mockResolvedValue({ confirmed: true }),
    setConfirmationState: jest.fn(),
    clearState: jest.fn()
  })
}))

describe('DeclarationPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH
  let mockModel
  let mockPageDef

  beforeEach(() => {
    mockModel = {}
    mockPageDef = {}
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
      }
    }

    mockContext = {
      state: {
        formData: {}
      }
    }

    mockH = {
      redirect: jest.fn().mockReturnValue('redirected')
    }

    formSubmissionService.submit.mockResolvedValue({
      result: {
        referenceNumber: 'REF123'
      }
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
    test('should return the correct path', () => {
      expect(
        formSlugHelper.getConfirmationPath(
          mockRequest,
          mockContext,
          'DeclarationController'
        )
      ).toBe('/adding-value/confirmation')
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

      expect(formSubmissionService.submit).toHaveBeenCalledWith(
        mockRequest.payload,
        mockContext.state
      )
      expect(mockContext.referenceNumber).toBe('REF123')
      expect(mockH.redirect).toHaveBeenCalledWith('/adding-value/confirmation')
    })

    test('should log submission details when available', async () => {
      const submissionDetails = {
        fieldsSubmitted: ['field1', 'field2'],
        timestamp: '2024-03-20T10:00:00Z'
      }
      formSubmissionService.submit.mockResolvedValue({
        result: {
          referenceNumber: 'REF123',
          submissionDetails
        }
      })

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.logger.info).toHaveBeenCalledWith({
        message: 'Form submission completed',
        referenceNumber: 'REF123',
        fieldsSubmitted: submissionDetails.fieldsSubmitted,
        timestamp: submissionDetails.timestamp
      })
    })

    test('should handle submission errors', async () => {
      const error = new Error('Submission failed')
      formSubmissionService.submit.mockRejectedValue(error)

      const handler = controller.makePostRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        error
      )
      expect(mockRequest.logger.error).toHaveBeenCalledWith(
        error,
        'Failed to submit form'
      )
    })
  })
})
