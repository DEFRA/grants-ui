import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getGasErrorMessage, handleGasApiError } from './gas-error-messages.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'

describe('gas-error-messages', () => {
  describe('getGasErrorMessage', () => {
    it.each([
      { statusCode: 400, heading: 'Invalid application data' },
      { statusCode: 401, heading: 'Authentication issue' },
      { statusCode: 403, heading: 'Authentication issue' },
      { statusCode: 404, heading: 'Service not found' },
      { statusCode: 409, heading: 'Application already submitted' },
      { statusCode: 422, heading: 'Application validation failed' },
      { statusCode: 429, heading: 'Too many requests' },
      { statusCode: 500, heading: 'Service temporarily unavailable' },
      { statusCode: 502, heading: 'Service temporarily unavailable' },
      { statusCode: 503, heading: 'Service temporarily unavailable' }
    ])('should return correct heading for status code $statusCode', ({ statusCode, heading }) => {
      const result = getGasErrorMessage(statusCode)

      expect(result.heading).toBe(heading)
      expect(result.message).toBeDefined()
    })

    it('should return fallback message for unknown status codes', () => {
      const result = getGasErrorMessage(418)

      expect(result.heading).toBe('Something went wrong')
      expect(result.message).toBeDefined()
    })
  })

  describe('handleGasApiError', () => {
    let mockH
    let mockContext
    let mockError

    beforeEach(() => {
      mockH = {
        view: vi.fn().mockReturnThis(),
        code: vi.fn().mockReturnThis()
      }
      mockContext = {
        referenceNumber: 'REF123'
      }
      mockError = {
        name: 'GrantApplicationServiceApiError',
        status: 429
      }
    })

    it('should render submission-error view with correct data', () => {
      handleGasApiError(mockH, mockContext, mockError)

      expect(mockH.view).toHaveBeenCalledWith('land-grants/submission-error', {
        backLink: null,
        heading: 'Too many requests',
        message: 'You have submitted too many requests. Please wait a moment and try again.',
        refNumber: 'REF123'
      })
      expect(mockH.code).toHaveBeenCalledWith(429)
    })

    it('should use status code 500 when error has no status', () => {
      mockError.status = undefined

      handleGasApiError(mockH, mockContext, mockError)

      expect(mockH.code).toHaveBeenCalledWith(statusCodes.internalServerError)
    })

    it('should use "N/A" as reference number when context has no referenceNumber', () => {
      mockContext.referenceNumber = undefined

      handleGasApiError(mockH, mockContext, mockError)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-grants/submission-error',
        expect.objectContaining({
          refNumber: 'N/A'
        })
      )
    })
  })
})
