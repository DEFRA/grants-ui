import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { transformStateObjectToGasApplication } from '../../common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { stateToLandGrantsGasAnswers } from '../mappers/state-to-gas-answers-mapper.js'
import { validateApplication } from '../services/land-grants.service.js'
import SubmissionPageController from './submission-page.controller.js'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '../../common/helpers/logging/log-codes.js'
import { mockSimpleRequest } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('~/src/server/common/services/grant-application/grant-application.service.js')
vi.mock('~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js')
vi.mock('../mappers/state-to-gas-answers-mapper.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js')
vi.mock('../services/land-grants.service.js')
vi.mock('~/src/server/common/helpers/logging/log.js')
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () => ({
  SummaryPageController: class {
    proceed() {}
    getNextPath() {}
    getSummaryViewModel() {}
  }
}))

const code = config.get('landGrants.grantCode')

describe('SubmissionPageController', () => {
  let controller
  let mockModel
  let mockPageDef
  let mockCacheService
  let mockRequest

  beforeEach(() => {
    vi.resetAllMocks()

    mockModel = {}
    mockPageDef = {}
    mockCacheService = {
      setState: vi.fn().mockResolvedValue(),
      getState: vi.fn().mockResolvedValue()
    }
    mockRequest = mockSimpleRequest()

    SubmissionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Submission page'
    })

    validateApplication.mockReturnValue(() => ({ valid: true }))
    getFormsCacheService.mockReturnValue(mockCacheService)

    controller = new SubmissionPageController(mockModel, mockPageDef)
  })

  describe('submitGasApplication', () => {
    it('should prepare and submit grant application', async () => {
      const mockIdentifiers = {
        sbi: '123456789',
        crn: 'crn123',
        frn: 'frn123',
        clientRef: 'ref123'
      }
      const mockGasApplicationData = {
        identifiers: mockIdentifiers,
        state: { key: 'value' },
        validationId: 'validation-123'
      }

      const mockState = { key: 'value' }
      const validationId = 'validation-123'
      const mockApplicationData = { transformed: 'data' }
      const mockResult = { success: true }

      transformStateObjectToGasApplication.mockReturnValue(mockApplicationData)
      submitGrantApplication.mockResolvedValue(mockResult)

      const result = await controller.submitGasApplication(mockRequest, mockGasApplicationData)

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        mockIdentifiers,
        { ...mockState, applicationValidationRunId: validationId },
        stateToLandGrantsGasAnswers
      )
      expect(submitGrantApplication).toHaveBeenCalledWith(code, mockApplicationData, mockRequest)
      expect(result).toEqual(mockResult)
    })
  })

  describe('handleSubmissionError', () => {
    it('should return error view with correct data', () => {
      const mockH = {
        view: vi.fn().mockReturnValue('error-view')
      }
      const mockRequest = {}
      const mockContext = {}
      const validationId = 'validation-123'

      controller.handleSubmissionError(mockH, mockRequest, mockContext, validationId)

      expect(mockH.view).toHaveBeenCalledWith('submission-error', {
        backLink: null,
        heading: 'Sorry, there was a problem submitting the application',
        refNumber: 'validation-123'
      })
    })

    it('should use validationId when provided', () => {
      const mockH = { view: vi.fn().mockReturnValue('error-view') }
      const mockRequest = {}
      const mockContext = { referenceNumber: 'REF456' }
      const validationId = 'validation-123'

      controller.handleSubmissionError(mockH, mockRequest, mockContext, validationId)

      expect(mockH.view).toHaveBeenCalledWith(
        'submission-error',
        expect.objectContaining({
          refNumber: 'validation-123'
        })
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_VALIDATION_ERROR,
        expect.objectContaining({
          validationId: 'validation-123'
        }),
        mockRequest
      )
    })

    it('should fallback to referenceNumber when validationId not provided', () => {
      const mockH = { view: vi.fn().mockReturnValue('error-view') }
      const mockRequest = {}
      const mockContext = { referenceNumber: 'REF456' }

      controller.handleSubmissionError(mockH, mockRequest, mockContext)

      expect(mockH.view).toHaveBeenCalledWith(
        'submission-error',
        expect.objectContaining({
          refNumber: 'REF456'
        })
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_VALIDATION_ERROR,
        expect.objectContaining({
          validationId: 'REF456'
        }),
        mockRequest
      )
    })

    it('should use N/A when neither validationId nor referenceNumber available', () => {
      const mockH = { view: vi.fn().mockReturnValue('error-view') }
      const mockRequest = {}
      const mockContext = {}

      controller.handleSubmissionError(mockH, mockRequest, mockContext)

      expect(mockH.view).toHaveBeenCalledWith(
        'submission-error',
        expect.objectContaining({
          refNumber: 'N/A'
        })
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_VALIDATION_ERROR,
        expect.objectContaining({
          validationId: 'N/A'
        }),
        mockRequest
      )
    })
  })

  describe('handleSuccessfulSubmission', () => {
    it('should set cache state and proceed', async () => {
      const mockRequest = { server: {} }
      const mockContext = { referenceNumber: 'REF123' }
      const mockH = { redirect: vi.fn().mockResolvedValue() }
      const statusCode = 204
      vi.spyOn(controller, 'getNextPath').mockReturnValue('/next-path')
      mockRequest.logger = mockRequestLogger()

      await controller.handleSuccessfulSubmission(mockRequest, mockContext, mockH, statusCode)

      expect(mockCacheService.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          applicationStatus: 'SUBMITTED'
        })
      )
      expect(mockH.redirect).toHaveBeenCalledWith('/confirmation')
    })

    it('should only log and update state when status is 204', async () => {
      const mockRequest = {
        server: {},
        auth: { credentials: { sbi: '123', crn: 'crn123' } }
      }
      const mockContext = {
        referenceNumber: 'REF123',
        relevantState: { field1: 'value1', field2: 'value2' }
      }
      const mockH = { redirect: vi.fn().mockResolvedValue() }
      vi.spyOn(controller, 'getStatusPath').mockReturnValue('/confirmation')
      mockCacheService.getState.mockResolvedValue({ existingField: 'value' })

      await controller.handleSuccessfulSubmission(mockRequest, mockContext, mockH, 204)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_COMPLETED,
        expect.objectContaining({
          numberOfFields: 2,
          status: 204
        }),
        mockRequest
      )
      expect(mockCacheService.setState).toHaveBeenCalled()
    })

    it('should not log when status is not 204', async () => {
      const mockRequest = {
        server: {},
        auth: { credentials: { sbi: '123', crn: 'crn123' } }
      }
      const mockContext = { referenceNumber: 'REF123' }
      const mockH = { redirect: vi.fn().mockResolvedValue() }
      vi.spyOn(controller, 'getStatusPath').mockReturnValue('/confirmation')

      vi.clearAllMocks()
      await controller.handleSuccessfulSubmission(mockRequest, mockContext, mockH, 200)

      expect(log).not.toHaveBeenCalledWith(LogCodes.SUBMISSION.SUBMISSION_COMPLETED, expect.anything())
      expect(mockCacheService.setState).not.toHaveBeenCalled()
    })

    it('should handle missing auth credentials', async () => {
      const mockRequest = { server: {} }
      const mockContext = { referenceNumber: 'REF123' }
      const mockH = { redirect: vi.fn().mockResolvedValue() }
      vi.spyOn(controller, 'getStatusPath').mockReturnValue('/confirmation')

      await controller.handleSuccessfulSubmission(mockRequest, mockContext, mockH, 204)

      expect(mockH.redirect).toHaveBeenCalledWith('/confirmation')
    })

    it('should handle missing relevantState when logging', async () => {
      const mockRequest = {
        server: {},
        auth: { credentials: { sbi: '123', crn: 'crn123' } }
      }
      const mockContext = { referenceNumber: 'REF123' }
      const mockH = { redirect: vi.fn().mockResolvedValue() }
      vi.spyOn(controller, 'getStatusPath').mockReturnValue('/confirmation')
      mockCacheService.getState.mockResolvedValue({})

      await controller.handleSuccessfulSubmission(mockRequest, mockContext, mockH, 204)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_COMPLETED,
        expect.objectContaining({
          numberOfFields: 0
        }),
        mockRequest
      )
    })
  })

  describe('getStatusPath', () => {
    it('should return confirmation path', () => {
      const mockRequest = {
        params: { slug: 'farm-payments' }
      }
      const mockContext = {
        referenceNumber: 'REF123',
        state: { formSlug: 'farm-payments' }
      }

      const result = controller.getStatusPath(mockRequest, mockContext)

      expect(result).toBe('/farm-payments/confirmation')
    })
  })

  describe('makePostRouteHandler', () => {
    it('should validate, submit application and redirect on success', async () => {
      const mockRequest = {
        logger: {
          info: vi.fn(),
          error: vi.fn()
        },
        auth: {
          credentials: {
            sbi: '123456789',
            crn: 'crn123'
          }
        },
        server: {}
      }
      const mockContext = {
        state: { landParcels: { parcel1: 'data' } },
        referenceNumber: 'REF123'
      }
      const mockH = {
        redirect: vi.fn().mockReturnValue('redirected'),
        view: vi.fn()
      }
      const mockValidationResult = { id: 'validation-123', valid: true }
      const statusCode = 204
      const mockSubmitResult = { success: true, status: statusCode }
      validateApplication.mockResolvedValue(mockValidationResult)

      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue(mockSubmitResult)
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(validateApplication).toHaveBeenCalledWith({
        applicationId: 'REF123',
        crn: 'crn123',
        sbi: '123456789',
        state: { landParcels: { parcel1: 'data' } }
      })
      expect(controller.submitGasApplication).toHaveBeenCalledWith(mockRequest, {
        identifiers: {
          clientRef: 'ref123',
          crn: 'crn123',
          sbi: '123456789'
        },
        state: mockContext.state,
        validationId: 'validation-123'
      })
      expect(controller.handleSuccessfulSubmission).toHaveBeenCalledWith(mockRequest, mockContext, mockH, statusCode)
      expect(result).toBe('proceeded')
    })

    it('should handle undefined auth', async () => {
      const mockRequest = {
        logger: { info: vi.fn(), error: vi.fn() },
        server: {}
      }
      const mockContext = {
        state: {},
        referenceNumber: 'REF123'
      }
      const mockH = { redirect: vi.fn(), view: vi.fn() }
      validateApplication.mockResolvedValue({ id: 'val-123', valid: true })
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ status: 204 })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.submitGasApplication).toHaveBeenCalledWith(mockRequest, {
        identifiers: {
          clientRef: 'ref123',
          crn: undefined,
          sbi: undefined
        },
        state: {},
        validationId: 'val-123'
      })
    })

    it('should extract frn from applicant business reference', async () => {
      const mockRequest = {
        logger: { info: vi.fn(), error: vi.fn() },
        auth: { credentials: { sbi: '123', crn: 'crn123' } },
        server: {}
      }
      const mockContext = {
        state: {
          applicant: {
            business: { reference: 'FRN999' }
          }
        },
        referenceNumber: 'REF123'
      }
      const mockH = { redirect: vi.fn(), view: vi.fn() }
      validateApplication.mockResolvedValue({ id: 'val-123', valid: true })
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ status: 204 })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.submitGasApplication).toHaveBeenCalledWith(mockRequest, {
        identifiers: expect.objectContaining({
          frn: 'FRN999'
        }),
        state: mockContext.state,
        validationId: 'val-123'
      })
    })

    it('should handle missing applicant', async () => {
      const mockRequest = {
        logger: { info: vi.fn(), error: vi.fn() },
        auth: { credentials: { sbi: '123', crn: 'crn123' } },
        server: {}
      }
      const mockContext = {
        state: {},
        referenceNumber: 'REF123'
      }
      const mockH = { redirect: vi.fn(), view: vi.fn() }
      validateApplication.mockResolvedValue({ id: 'val-123', valid: true })
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ status: 204 })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.submitGasApplication).toHaveBeenCalledWith(mockRequest, {
        identifiers: expect.objectContaining({
          frn: undefined
        }),
        state: {},
        validationId: 'val-123'
      })
    })

    it('should convert referenceNumber to lowercase for clientRef', async () => {
      const mockRequest = {
        logger: { info: vi.fn(), error: vi.fn() },
        auth: { credentials: { sbi: '123', crn: 'crn123' } },
        server: {}
      }
      const mockContext = {
        state: {},
        referenceNumber: 'REF-UPPER-123'
      }
      const mockH = { redirect: vi.fn(), view: vi.fn() }
      validateApplication.mockResolvedValue({ id: 'val-123', valid: true })
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ status: 204 })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.submitGasApplication).toHaveBeenCalledWith(mockRequest, {
        identifiers: expect.objectContaining({
          clientRef: 'ref-upper-123'
        }),
        state: {},
        validationId: 'val-123'
      })
    })

    it('should return error view when validation fails', async () => {
      const mockRequest = {
        logger: {
          info: vi.fn(),
          error: vi.fn()
        },
        auth: {
          credentials: {
            sbi: '123456789',
            crn: 'crn123'
          }
        },
        server: {}
      }
      const mockContext = {
        state: { landParcels: {} },
        referenceNumber: 'REF123'
      }
      const mockH = {
        view: vi.fn().mockReturnValue('error-view'),
        redirect: vi.fn()
      }

      const mockValidationResult = { id: 'validation-123', valid: false }

      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'handleSubmissionError').mockReturnValue('error-view')
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ success: true })

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.handleSubmissionError).toHaveBeenCalledWith(mockH, mockRequest, mockContext, 'validation-123')
      expect(controller.submitGasApplication).not.toHaveBeenCalled()
      expect(result).toBe('error-view')
    })

    it('should handle submission errors', async () => {
      const mockError = new Error('Submission failed')
      const mockRequest = {
        logger: {
          info: vi.fn(),
          error: vi.fn()
        },
        auth: {
          credentials: {
            sbi: '123456789',
            crn: 'crn123'
          }
        },
        server: {}
      }
      const mockContext = {
        state: {
          applicant: {
            business: {
              reference: 'FRN123'
            }
          }
        },
        referenceNumber: 'REF123'
      }
      const mockH = {
        redirect: vi.fn(),
        view: vi.fn()
      }
      const mockValidationResult = { id: 'validation-123', valid: true }

      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockRejectedValue(mockError)

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'submission-error',
        expect.objectContaining({
          backLink: null,
          heading: 'Sorry, there was a problem submitting the application',
          refNumber: 'REF123'
        })
      )
    })

    it('should handle validation error gracefully', async () => {
      const mockError = new Error('Validation failed')
      const mockRequest = {
        logger: {
          info: vi.fn(),
          error: vi.fn()
        },
        auth: undefined,
        server: {}
      }
      const mockContext = {
        state: {},
        referenceNumber: 'REF123'
      }
      const mockH = {
        redirect: vi.fn(),
        view: vi.fn()
      }

      validateApplication.mockRejectedValue(mockError)

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          endpoint: 'Land grants submission',
          error: 'submitting application for sbi: undefined and crn: undefined - Validation failed'
        }),
        mockRequest
      )
    })

    it('should handle errors from handleSuccessfulSubmission', async () => {
      const mockError = new Error('Cache service failed')
      const mockRequest = {
        logger: {
          info: vi.fn(),
          error: vi.fn()
        },
        auth: {
          credentials: {
            sbi: '123456789',
            crn: 'crn123'
          }
        },
        server: {}
      }
      const mockContext = {
        state: {},
        referenceNumber: 'REF123'
      }
      const mockH = {
        view: vi.fn().mockReturnValue('error-view')
      }
      const mockValidationResult = { id: 'validation-123', valid: true }
      const mockSubmitResult = { success: true }

      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue(mockSubmitResult)
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockRejectedValue(mockError)

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'submission-error',
        expect.objectContaining({
          backLink: null,
          heading: 'Sorry, there was a problem submitting the application',
          refNumber: 'REF123'
        })
      )
    })
  })
})
