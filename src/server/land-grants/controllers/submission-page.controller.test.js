import { vi } from 'vitest'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { transformStateObjectToGasApplication } from '../../common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { stateToLandGrantsGasAnswers } from '../mappers/state-to-gas-answers-mapper.js'
import { validateApplication } from '../services/land-grants.service.js'
import SubmissionPageController from './submission-page.controller.js'
import { log, debug } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '../../common/helpers/logging/log-codes.js'
import { mockSimpleRequest } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('~/src/server/common/services/grant-application/grant-application.service.js')
vi.mock('~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js')
vi.mock('../mappers/state-to-gas-answers-mapper.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js')
vi.mock('../services/land-grants.service.js')
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () => ({
  SummaryPageController: class {
    proceed() {}
    getNextPath() {}
    getSummaryViewModel() {}
  }
}))
vi.mock('~/src/config/config.js', async () => {
  const { mockLandGrantsConfig } = await import('~/src/__mocks__')
  return mockLandGrantsConfig()
})

const grantCode = 'TEST-GRANT-CODE'

describe('SubmissionPageController', () => {
  let controller
  let mockModel
  let mockPageDef
  let mockCacheService
  let mockRequest

  beforeEach(() => {
    vi.resetAllMocks()

    mockModel = {
      def: {
        metadata: {
          submission: {
            grantCode
          }
        }
      }
    }
    mockPageDef = {}
    mockCacheService = {
      setState: vi.fn().mockResolvedValue(),
      getState: vi.fn().mockResolvedValue({})
    }
    mockRequest = mockSimpleRequest({ params: { slug: grantCode } })

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
      const mockValidationResult = {
        id: 'validation-123',
        message: 'success',
        valid: true
      }
      const mockGasApplicationData = {
        identifiers: mockIdentifiers,
        state: { key: 'value' },
        validationResult: mockValidationResult
      }

      const mockState = { key: 'value' }
      const mockApplicationData = { transformed: 'data' }
      const mockResult = { success: true }

      transformStateObjectToGasApplication.mockReturnValue(mockApplicationData)
      submitGrantApplication.mockResolvedValue(mockResult)

      const result = await controller.submitGasApplication(mockRequest, mockGasApplicationData)

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        mockIdentifiers,
        expect.objectContaining({
          ...mockState,
          validationResult: mockValidationResult
        }),
        stateToLandGrantsGasAnswers
      )
      expect(submitGrantApplication).toHaveBeenCalledWith(grantCode, mockApplicationData, mockRequest)
      expect(result).toEqual(mockResult)
    })
  })

  describe('renderSubmissionError', () => {
    const mockRequest = {
      params: { slug: 'test-grant' }
    }
    it('should return error view with correct data', () => {
      const mockH = {
        view: vi.fn().mockReturnValue('error-view')
      }
      const mockContext = {}
      const validationId = 'validation-123'

      controller.renderSubmissionError(mockH, mockRequest, mockContext, validationId)

      expect(mockH.view).toHaveBeenCalledWith('submission-error', {
        backLink: null,
        heading: 'Sorry, there was a problem submitting the application',
        refNumber: 'validation-123'
      })
    })

    it.each([
      ['validationId when provided', { referenceNumber: 'REF456' }, 'validation-123', 'validation-123'],
      ['referenceNumber when validationId not provided', { referenceNumber: 'REF456' }, undefined, 'REF456'],
      ['N/A when neither available', {}, undefined, 'N/A']
    ])('should use %s', (_desc, context, validationId, expectedRef) => {
      const mockH = { view: vi.fn().mockReturnValue('error-view') }

      controller.renderSubmissionError(mockH, mockRequest, context, validationId)

      expect(mockH.view).toHaveBeenCalledWith('submission-error', expect.objectContaining({ refNumber: expectedRef }))
      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_VALIDATION_ERROR,
        expect.objectContaining({ validationId: expectedRef }),
        mockRequest
      )
    })
  })

  describe('handleSuccessfulSubmission', () => {
    it('should set cache state and proceed', async () => {
      const mockRequest = {
        server: {},
        params: { slug: 'test-grant' }
      }
      const mockContext = { referenceNumber: 'REF123', state: { previousReferenceNumber: 'REF345' } }
      const mockH = { redirect: vi.fn().mockResolvedValue() }
      const statusCode = 204
      vi.spyOn(controller, 'getNextPath').mockReturnValue('/next-path')

      await controller.handleSuccessfulSubmission(mockRequest, mockContext, mockH, statusCode)

      expect(mockCacheService.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          applicationStatus: 'SUBMITTED'
        })
      )
    })

    it('should only log and update state when status is 204', async () => {
      const mockRequest = {
        server: {},
        auth: { credentials: { sbi: '123', crn: 'crn123' } },
        params: { slug: 'test-grant' }
      }
      const mockContext = {
        referenceNumber: 'REF123',
        relevantState: { field1: 'value1', field2: 'value2' },
        state: { previousReferenceNumber: 'REF345' }
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
        auth: {
          credentials: { sbi: '123', crn: 'crn123' }
        },
        params: { slug: 'test-grant' }
      }
      const mockContext = { referenceNumber: 'REF123', state: { previousReferenceNumber: 'REF345' } }
      const mockH = { redirect: vi.fn().mockResolvedValue() }
      vi.spyOn(controller, 'getStatusPath').mockReturnValue('/confirmation')

      vi.clearAllMocks()
      await controller.handleSuccessfulSubmission(mockRequest, mockContext, mockH, 200)

      expect(log).not.toHaveBeenCalledWith(LogCodes.SUBMISSION.SUBMISSION_COMPLETED, expect.anything())
      expect(mockCacheService.setState).not.toHaveBeenCalled()
    })

    it('should handle missing auth credentials', async () => {
      const mockRequest = {
        server: {},
        params: { slug: 'test-grant' }
      }
      const mockContext = { referenceNumber: 'REF123', state: { previousReferenceNumber: 'REF345' } }
      const mockH = { redirect: vi.fn().mockResolvedValue() }
      vi.spyOn(controller, 'getStatusPath').mockReturnValue('/confirmation')

      await controller.handleSuccessfulSubmission(mockRequest, mockContext, mockH, 204)

      expect(mockH.redirect).toHaveBeenCalledWith('/confirmation')
    })

    it('should handle missing relevantState when logging', async () => {
      const mockRequest = {
        server: {},
        auth: { credentials: { sbi: '123', crn: 'crn123' } },
        params: { slug: 'test-grant' }
      }
      const mockContext = { referenceNumber: 'REF123', state: { previousReferenceNumber: 'REF345' } }
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

  describe('getBackLink', () => {
    beforeEach(() => {
      controller.model = { basePath: 'farm-payments' }
    })

    it('should point to consent page when consents are required', () => {
      const context = {
        state: {
          landParcels: {
            'AB1234-5678': { actionsObj: { ACTION1: { consents: ['sssi'] } } }
          }
        }
      }
      const result = controller.getBackLink({}, context)
      expect(result).toEqual({ text: 'Back', href: '/farm-payments/you-must-have-consent' })
    })

    it('should point to check-selected-land-actions when no consents required', () => {
      const context = {
        state: {
          landParcels: {
            'AB1234-5678': { actionsObj: { ACTION1: { consents: [] } } }
          }
        }
      }
      const result = controller.getBackLink({}, context)
      expect(result).toEqual({ text: 'Back', href: '/farm-payments/check-selected-land-actions' })
    })

    it('should point to check-selected-land-actions when no land parcels in state', () => {
      const context = { state: {} }
      const result = controller.getBackLink({}, context)
      expect(result).toEqual({ text: 'Back', href: '/farm-payments/check-selected-land-actions' })
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
    let postRequest, postContext, postH

    beforeEach(() => {
      postRequest = {
        auth: { credentials: { sbi: '123456789', crn: 'crn123' } },
        server: {},
        params: { slug: 'test-grant' }
      }
      postContext = { state: {}, referenceNumber: 'REF123' }
      postH = { redirect: vi.fn().mockReturnValue('redirected'), view: vi.fn().mockReturnValue('error-view') }
    })

    it('should validate, submit application and redirect on success', async () => {
      postContext.state = { landParcels: { parcel1: 'data' }, previousReferenceNumber: 'REF345' }
      const mockValidationResult = { id: 'validation-123', valid: true }
      const mockSubmitResult = { success: true, status: 204 }
      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue(mockSubmitResult)
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      const result = await handler(postRequest, postContext, postH)

      expect(validateApplication).toHaveBeenCalledWith({
        applicationId: 'REF123',
        crn: 'crn123',
        sbi: '123456789',
        state: postContext.state
      })
      expect(controller.submitGasApplication).toHaveBeenCalledWith(postRequest, {
        identifiers: {
          clientRef: 'ref123',
          previousClientRef: 'ref345',
          crn: 'crn123',
          frn: undefined,
          sbi: '123456789'
        },
        state: postContext.state,
        validationResult: mockValidationResult
      })
      expect(controller.handleSuccessfulSubmission).toHaveBeenCalledWith(postRequest, postContext, postH, 204)
      expect(result).toBe('proceeded')
    })

    it('should not include previousClientRef when previousReferenceNumber is absent', async () => {
      postContext.state = { landParcels: { parcel1: 'data' } }
      const mockValidationResult = { id: 'validation-123', valid: true }
      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ success: true, status: 204 })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(postRequest, postContext, postH)

      const identifiers = controller.submitGasApplication.mock.calls[0][1].identifiers
      expect(identifiers).toEqual({
        clientRef: 'ref123',
        crn: 'crn123',
        frn: undefined,
        sbi: '123456789'
      })
      expect(identifiers).not.toHaveProperty('previousClientRef')
    })

    it('should handle undefined auth', async () => {
      postRequest = { server: {}, params: { slug: 'test-grant' } }
      postContext.state = { previousReferenceNumber: 'REF345' }
      const mockValidationResult = { id: 'val-123', valid: true }
      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ status: 204 })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(postRequest, postContext, postH)

      expect(controller.submitGasApplication).toHaveBeenCalledWith(postRequest, {
        identifiers: {
          clientRef: 'ref123',
          previousClientRef: 'ref345',
          crn: undefined,
          frn: undefined,
          sbi: undefined
        },
        state: postContext.state,
        validationResult: mockValidationResult
      })
    })

    it('should extract frn from applicant business reference', async () => {
      postContext.state = { applicant: { business: { reference: 'FRN999' } } }
      const mockValidationResult = { id: 'val-123', valid: true }
      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ status: 204 })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(postRequest, postContext, postH)

      expect(controller.submitGasApplication).toHaveBeenCalledWith(postRequest, {
        identifiers: expect.objectContaining({ frn: 'FRN999' }),
        state: postContext.state,
        validationResult: mockValidationResult
      })
    })

    it('should handle missing applicant', async () => {
      const mockValidationResult = { id: 'val-123', valid: true }
      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ status: 204 })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(postRequest, postContext, postH)

      expect(controller.submitGasApplication).toHaveBeenCalledWith(postRequest, {
        identifiers: expect.objectContaining({ frn: undefined }),
        state: {},
        validationResult: mockValidationResult
      })
    })

    it('should convert referenceNumber to lowercase for clientRef', async () => {
      postContext.referenceNumber = 'REF-UPPER-123'
      const mockValidationResult = { id: 'val-123', valid: true }
      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ status: 204 })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(postRequest, postContext, postH)

      expect(controller.submitGasApplication).toHaveBeenCalledWith(postRequest, {
        identifiers: expect.objectContaining({ clientRef: 'ref-upper-123' }),
        state: {},
        validationResult: mockValidationResult
      })
    })

    it('should convert previousReferenceNumber to lowercase for previousClientRef', async () => {
      postContext.referenceNumber = 'REF-UPPER-123'
      const mockValidationResult = { id: 'val-123', valid: true }
      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ status: 204 })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(postRequest, postContext, postH)

      expect(controller.submitGasApplication).toHaveBeenCalledWith(postRequest, {
        identifiers: expect.objectContaining({ clientRef: 'ref-upper-123' }),
        state: {},
        validationResult: mockValidationResult
      })
    })

    it('should return error view when validation fails', async () => {
      postContext.state = { landParcels: {} }
      const mockValidationResult = { id: 'validation-123', valid: false }
      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'renderSubmissionError').mockReturnValue('error-view')
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ success: true })

      const handler = controller.makePostRouteHandler()
      const result = await handler(postRequest, postContext, postH)

      expect(controller.renderSubmissionError).toHaveBeenCalledWith(postH, postRequest, postContext, 'validation-123')
      expect(controller.submitGasApplication).not.toHaveBeenCalled()
      expect(result).toBe('error-view')
    })

    it('should handle submission errors', async () => {
      postContext.state = { applicant: { business: { reference: 'FRN123' } } }
      const mockValidationResult = { id: 'validation-123', valid: true }
      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockRejectedValue(new Error('Submission failed'))

      const handler = controller.makePostRouteHandler()
      await handler(postRequest, postContext, postH)

      expect(postH.view).toHaveBeenCalledWith(
        'submission-error',
        expect.objectContaining({
          backLink: null,
          heading: 'Sorry, there was a problem submitting the application',
          refNumber: 'REF123'
        })
      )
    })

    it('should handle validation error gracefully', async () => {
      postRequest = { auth: undefined, server: {}, params: { slug: 'test-grant' } }
      validateApplication.mockRejectedValue(new Error('Validation failed'))

      const handler = controller.makePostRouteHandler()
      await handler(postRequest, postContext, postH)

      expect(debug).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_FAILURE,
        expect.objectContaining({
          grantType: 'test-grant',
          referenceNumber: 'REF123',
          sbi: undefined,
          crn: undefined,
          errorMessage: 'Validation failed'
        }),
        postRequest
      )
    })

    it('should handle errors from handleSuccessfulSubmission', async () => {
      const mockValidationResult = { id: 'validation-123', valid: true }
      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ success: true })
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockRejectedValue(new Error('Cache service failed'))

      const handler = controller.makePostRouteHandler()
      await handler(postRequest, postContext, postH)

      expect(postH.view).toHaveBeenCalledWith(
        'submission-error',
        expect.objectContaining({
          backLink: null,
          heading: 'Sorry, there was a problem submitting the application',
          refNumber: 'REF123'
        })
      )
    })

    it('should handle timeout when submitting application gracefully', async () => {
      postContext.referenceNumber = 'REF456'
      validateApplication.mockRejectedValue(new Error('Operation timed out after 30000ms'))

      const handler = controller.makePostRouteHandler()
      await handler(postRequest, postContext, postH)

      expect(postH.view).toHaveBeenCalledWith(
        'submission-error',
        expect.objectContaining({
          backLink: null,
          heading: 'Sorry, there was a problem submitting the application',
          refNumber: 'REF456'
        })
      )
    })
  })
})
