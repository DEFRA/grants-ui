import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { transformStateObjectToGasApplication } from '../../common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { stateToLandGrantsGasAnswers } from '../mappers/state-to-gas-answers-mapper.js'
import { validateApplication } from '../services/land-grants.service.js'
import SubmissionPageController from './submission-page.controller.js'

vi.mock('~/src/server/common/services/grant-application/grant-application.service.js')
vi.mock('~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js')
vi.mock('../mappers/state-to-gas-answers-mapper.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js')
vi.mock('../services/land-grants.service.js')
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () => ({
  SummaryPageController: class {
    proceed() {}
    getNextPath() {}
    getViewModel() {}
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
      setConfirmationState: vi.fn().mockResolvedValue()
    }

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

  describe('handleValidationError', () => {
    it('should return error view with correct data', () => {
      const mockH = {
        view: vi.fn().mockReturnValue('error-view')
      }
      const mockRequest = {}
      const mockContext = {}
      const validationId = 'validation-123'

      controller.handleValidationError(mockH, mockRequest, mockContext, validationId)

      expect(mockH.view).toHaveBeenCalledWith('submission-error', {
        backLink: null,
        heading: 'Sorry, there was a problem validating the application',
        refNumber: 'validation-123'
      })
    })
  })

  describe('handleSuccessfulSubmission', () => {
    it('should set cache state and proceed', async () => {
      const mockRequest = { server: {} }
      const mockContext = { referenceNumber: 'REF123' }
      const mockH = {}

      vi.spyOn(controller, 'proceed').mockReturnValue('proceeded')
      vi.spyOn(controller, 'getNextPath').mockReturnValue('/next-path')

      const result = await controller.handleSuccessfulSubmission(mockRequest, mockContext, mockH)

      expect(mockCacheService.setConfirmationState).toHaveBeenCalledWith(mockRequest, {
        confirmed: true,
        $$__referenceNumber: 'REF123'
      })
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('proceeded')
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
      const mockSubmitResult = { success: true }
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
      expect(controller.handleSuccessfulSubmission).toHaveBeenCalledWith(mockRequest, mockContext, mockH)
      expect(mockRequest.logger.info).toHaveBeenCalledWith('Form submission completed', mockSubmitResult)
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
      vi.spyOn(controller, 'handleValidationError').mockReturnValue('error-view')
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue({ success: true })

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.handleValidationError).toHaveBeenCalledWith(mockH, mockRequest, mockContext, 'validation-123')
      expect(controller.submitGasApplication).not.toHaveBeenCalled()
      expect(result).toBe('error-view')
    })

    it('should handle validation errors and rethrow them', async () => {
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
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(mockError)

      expect(mockRequest.logger.error).toHaveBeenCalledWith('Error submitting application:', mockError)
      expect(mockH.redirect).not.toHaveBeenCalled()
      expect(mockCacheService.setConfirmationState).not.toHaveBeenCalled()
    })

    it('should handle submission errors and rethrow them', async () => {
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
        state: {},
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
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(mockError)

      expect(mockRequest.logger.error).toHaveBeenCalledWith('Error submitting application:', mockError)
      expect(mockH.redirect).not.toHaveBeenCalled()
      expect(mockCacheService.setConfirmationState).not.toHaveBeenCalled()
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
      const mockH = {}
      const mockValidationResult = { id: 'validation-123', valid: true }
      const mockSubmitResult = { success: true }

      validateApplication.mockResolvedValue(mockValidationResult)
      vi.spyOn(controller, 'submitGasApplication').mockResolvedValue(mockSubmitResult)
      vi.spyOn(controller, 'handleSuccessfulSubmission').mockRejectedValue(mockError)

      const handler = controller.makePostRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(mockError)

      expect(mockRequest.logger.error).toHaveBeenCalledWith('Error submitting application:', mockError)
    })
  })
})
