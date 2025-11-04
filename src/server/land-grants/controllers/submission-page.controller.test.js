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

  beforeEach(() => {
    vi.resetAllMocks()

    mockModel = {}
    mockPageDef = {}
    mockCacheService = {
      setState: vi.fn().mockResolvedValue(),
      getState: vi.fn().mockResolvedValue()
    }

    SubmissionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Submission page'
    })

    validateApplication.mockReturnValue(() => ({ valid: true }))
    getFormsCacheService.mockReturnValue(mockCacheService)

    controller = new SubmissionPageController(mockModel, mockPageDef)
  })

  describe('constructor', () => {
    it('should set viewName to "submit-your-application"', () => {
      expect(controller.viewName).toBe('submit-your-application')
    })

    it('should set grantCode', () => {
      expect(controller.grantCode).toBe(code)
    })
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

      const result = await controller.submitGasApplication(mockGasApplicationData)

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        mockIdentifiers,
        { ...mockState, applicationValidationRunId: validationId },
        stateToLandGrantsGasAnswers
      )
      expect(submitGrantApplication).toHaveBeenCalledWith(code, mockApplicationData)
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
      expect(controller.submitGasApplication).toHaveBeenCalledWith({
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

    it('should handle validation errors', async () => {
      const mockError = new Error('Validation failed')
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
        redirect: vi.fn(),
        view: vi.fn()
      }

      validateApplication.mockRejectedValue(mockError)

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

    it('should use empty object for landParcels if not present in state', async () => {
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
        redirect: vi.fn().mockReturnValue('redirected'),
        view: vi.fn()
      }

      const mockValidationResult = { id: 'validation-123', valid: true }
      const mockSubmitResult = { success: true }

      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue(mockSubmitResult)
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockResolvedValue('proceeded')

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(validateApplication).toHaveBeenCalledWith({
        applicationId: 'REF123',
        crn: 'crn123',
        sbi: '123456789',
        state: {}
      })
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
