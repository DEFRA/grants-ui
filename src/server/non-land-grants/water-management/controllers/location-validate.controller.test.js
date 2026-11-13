import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import LocationValidateController from './location-validate.controller.js'
import { invokeGrantScoringGetAction } from '~/src/server/common/services/grant-scoring/grant-scoring.service.js'

vi.mock('~/src/server/common/services/grant-scoring/grant-scoring.service.js', () => ({
  invokeGrantScoringGetAction: vi.fn()
}))

describe('LocationValidateController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    const mockModel = {
      def: {
        metadata: {
          pageConfig: {}
        }
      }
    }
    const mockPageDef = {
      path: '/where-project-located',
      title: 'Where is your project located?'
    }

    // Mock prototype methods before instantiation if needed, or ensure they exist
    QuestionPageController.prototype.makePostRouteHandler = vi.fn().mockReturnValue(() => 'parent-handler-result')
    QuestionPageController.prototype.getNextPath = vi.fn().mockReturnValue('/next-page')

    controller = new LocationValidateController(mockModel, mockPageDef)
    controller.proceed = vi.fn().mockResolvedValue('redirected')
    controller.setState = vi.fn().mockImplementation((req, state) => {
      mockContext.state = { ...mockContext.state, ...state }
    })
    controller.getState = vi.fn().mockResolvedValue({})

    mockRequest = {
      payload: {
        projectLocated__easting: '123456',
        projectLocated__northing: '654321'
      }
    }
    mockContext = {
      state: {
        additionalAnswers: {}
      }
    }
    mockH = {}

    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getNextPath', () => {
    it('should return parent getNextPath when locationFound is true', () => {
      mockContext.state.additionalAnswers.locationFound = true
      const result = controller.getNextPath(mockContext)
      expect(result).toBe('/next-page')
      expect(QuestionPageController.prototype.getNextPath).toHaveBeenCalledWith(mockContext)
    })

    it('should return exit page when locationFound is false', () => {
      mockContext.state.additionalAnswers.locationFound = false
      const result = controller.getNextPath(mockContext)
      expect(result).toBe('/exit-eligibility-project-location')
    })

    it('should return exit page when locationFound is missing', () => {
      const result = controller.getNextPath(mockContext)
      expect(result).toBe('/exit-eligibility-project-location')
    })
  })
  describe('makePostRouteHandler', () => {
    it('should call parent handler and update context state when scoring service succeeds', async () => {
      invokeGrantScoringGetAction.mockResolvedValueOnce({
        locationFound: true
      })

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(invokeGrantScoringGetAction).toHaveBeenCalledWith('validate/location', 'water-management', {
        easting: '123456',
        northing: '654321'
      })
      expect(mockContext.state.additionalAnswers.locationFound).toBe(true)
      expect(result).toBe('parent-handler-result')
    })

    it('should update context state with locationFound false when scoring service returns not found', async () => {
      invokeGrantScoringGetAction.mockResolvedValueOnce({
        locationFound: false
      })

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(invokeGrantScoringGetAction).toHaveBeenCalled()
      expect(mockContext.state.additionalAnswers.locationFound).toBe(false)
      expect(result).toBe('parent-handler-result')
    })

    it('should throw if scoring service fails with error', async () => {
      const error = new Error('Internal Server Error')
      error._details = { upstreamStatus: 500 }
      invokeGrantScoringGetAction.mockRejectedValueOnce(error)

      const handler = controller.makePostRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow('Internal Server Error')
    })

    it('should handle missing payload gracefully', async () => {
      invokeGrantScoringGetAction.mockResolvedValueOnce({})
      mockRequest.payload = undefined

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(invokeGrantScoringGetAction).toHaveBeenCalledWith('validate/location', 'water-management', {
        easting: undefined,
        northing: undefined
      })
    })

    it('should call parent handler immediately if there are validation errors', async () => {
      mockContext.errors = { some: 'error' }
      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(invokeGrantScoringGetAction).not.toHaveBeenCalled()
      expect(result).toBe('parent-handler-result')
    })
  })
})
