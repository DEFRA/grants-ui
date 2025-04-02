import { formSubmissionService } from '~/src/server/common/forms/services/submission.js'
import DeclarationPageController from './controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js')
jest.mock('~/src/server/common/forms/services/submission.js')

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
        error: jest.fn()
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
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('declaration-page')
  })

  describe('getStatusPath', () => {
    test('should return the correct path', () => {
      expect(controller.getStatusPath()).toBe('/adding-value/confirmation')
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

      mockRequest.logger.info = jest.fn()
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
