import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { transformStateObjectToGasApplication } from '../../common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { stateToLandGrantsGasAnswers } from '../mappers/state-to-gas-answers-mapper.js'
import SubmissionPageController from './submission-page.controller.js'
import { validateApplication } from '../services/land-grants.service.js'

vi.mock('~/src/server/common/services/grant-application/grant-application.service.js')
vi.mock('~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js')
vi.mock('../mappers/state-to-gas-answers-mapper.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', async () => {
  const { mockFormsCacheService } = await import('~/src/__mocks__')
  return mockFormsCacheService()
})
vi.mock('../services/land-grants.service.js')
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () => {
  return {
    SummaryPageController: class {
      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
      }

      proceed() {}
      getNextPath() {}
    }
  }
})

const code = config.get('landGrants.grantCode')

describe('SubmissionPageController', () => {
  let controller
  let mockModel
  let mockPageDef

  beforeEach(() => {
    vi.resetAllMocks()

    mockModel = {}
    mockPageDef = {}

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

  describe('submitLandGrantApplication', () => {
    it('should transform state and submit grant application', async () => {
      const mockContext = {
        referenceNumber: '123456',
        state: { key: 'value' }
      }
      const mockApplicationData = { transformed: 'data' }
      const mockResult = { success: true, clientRef: '123456' }
      const applicationValidationRunId = '123456'

      transformStateObjectToGasApplication.mockReturnValue(mockApplicationData)
      submitGrantApplication.mockResolvedValue(mockResult)
      validateApplication.mockResolvedValue({ id: applicationValidationRunId })

      const result = await controller.submitLandGrantApplication('123456789', 'crn', mockContext)

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        {
          sbi: '123456789',
          frn: 'frn',
          crn: 'crn',
          defraId: 'defraId',
          clientRef: '123456'
        },
        { ...mockContext.state, applicationValidationRunId },
        stateToLandGrantsGasAnswers
      )
      expect(submitGrantApplication).toHaveBeenCalledWith(code, mockApplicationData)
      expect(result).toEqual(mockResult)
    })
  })

  describe('makePostRouteHandler', () => {
    it('should return a function that submits the application and redirects on success', async () => {
      const mockRequest = {
        logger: {
          info: vi.fn(),
          error: vi.fn()
        },
        auth: {
          isAuthenticated: true,
          credentials: {
            sbi: '123456789',
            name: 'John Doe',
            organisationId: 'org123',
            organisationName: ' Farm 1',
            role: 'admin',
            sessionId: 'valid-session-id',
            crn: 'crn'
          }
        }
      }
      const mockContext = { state: {} }
      const mockH = {
        redirect: vi.fn().mockReturnValue('redirected')
      }
      const mockResult = { success: true }

      vi.spyOn(controller, 'submitLandGrantApplication').mockResolvedValue(mockResult)

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.submitLandGrantApplication).toHaveBeenCalledWith('123456789', 'crn', mockContext)
      expect(mockRequest.logger.info).toHaveBeenCalledWith('Form submission completed', mockResult)
    })

    it('should handle errors and rethrow them', async () => {
      const mockError = new Error('Submission failed')
      const mockRequest = {
        logger: {
          info: vi.fn(),
          error: vi.fn()
        },
        auth: {
          isAuthenticated: true,
          credentials: {
            sbi: '123456789',
            name: 'John Doe',
            organisationId: 'org123',
            organisationName: ' Farm 1',
            role: 'admin',
            sessionId: 'valid-session-id'
          }
        }
      }
      const mockContext = { state: {} }
      const mockH = {
        redirect: vi.fn()
      }

      vi.spyOn(controller, 'submitLandGrantApplication').mockRejectedValue(mockError)

      const handler = controller.makePostRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(mockError)
      expect(mockH.redirect).not.toHaveBeenCalled()
    })
  })
})
