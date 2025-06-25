import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { sbiController } from './sbi.controller.js'
import { sbiStore } from './state.js'

jest.mock('~/src/server/common/constants/status-codes.js', () => ({
  statusCodes: {
    ok: 200,
    methodNotAllowed: 405
  }
}))

jest.mock('./state.js', () => ({
  sbiStore: {
    set: jest.fn()
  }
}))

describe('sbiController', () => {
  let mockRequest
  let mockH

  beforeEach(() => {
    jest.clearAllMocks()

    mockH = {
      response: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis()
    }
  })

  describe('POST requests', () => {
    beforeEach(() => {
      mockRequest = {
        method: 'post',
        payload: {
          sbi: 'test-sbi-value'
        }
      }
    })

    it('should successfully update SBI and return success message', () => {
      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', 'test-sbi-value')
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })

    it('should handle empty SBI value', () => {
      mockRequest.payload.sbi = ''

      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', '')
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })

    it('should handle null SBI value', () => {
      mockRequest.payload.sbi = null

      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', null)
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })

    it('should handle complex SBI object', () => {
      const complexSbi = {
        id: 123,
        name: 'Test SBI',
        config: { enabled: true }
      }
      mockRequest.payload.sbi = complexSbi

      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', complexSbi)
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })
  })

  describe('Non-POST requests', () => {
    it('should return method not allowed for GET requests', () => {
      mockRequest = {
        method: 'get',
        payload: {}
      }

      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })

    it('should return method not allowed for PUT requests', () => {
      mockRequest = {
        method: 'put',
        payload: { sbi: 'test-value' }
      }

      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })

    it('should return method not allowed for DELETE requests', () => {
      mockRequest = {
        method: 'delete',
        payload: {}
      }

      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })

    it('should return method not allowed for PATCH requests', () => {
      mockRequest = {
        method: 'patch',
        payload: { sbi: 'test-value' }
      }

      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })
  })

  describe('Edge cases', () => {
    it('should handle missing payload', () => {
      mockRequest = {
        method: 'post'
      }

      expect(() => {
        sbiController.handler(mockRequest, mockH)
      }).toThrow()
    })

    it('should handle payload without sbi property', () => {
      mockRequest = {
        method: 'post',
        payload: {}
      }

      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', undefined)
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })
  })

  describe('Response chaining', () => {
    it('should return the result of the response chain for POST requests', () => {
      mockRequest = {
        method: 'post',
        payload: { sbi: 'test-value' }
      }

      const result = sbiController.handler(mockRequest, mockH)

      expect(result).toBe(mockH)
    })

    it('should return the result of the response chain for non-POST requests', () => {
      mockRequest = {
        method: 'get',
        payload: {}
      }

      const result = sbiController.handler(mockRequest, mockH)

      expect(result).toBe(mockH)
    })
  })

  describe('sbiStore integration', () => {
    it('should call sbiStore.set with correct parameters only once per request', () => {
      mockRequest = {
        method: 'post',
        payload: { sbi: 'unique-sbi-value' }
      }

      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledTimes(1)
      expect(sbiStore.set).toHaveBeenCalledWith('sbi', 'unique-sbi-value')
    })

    it('should not call sbiStore.set for non-POST requests', () => {
      mockRequest = {
        method: 'get',
        payload: { sbi: 'should-not-be-stored' }
      }

      sbiController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
    })
  })
})
