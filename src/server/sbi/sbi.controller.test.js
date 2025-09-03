import { vi } from 'vitest'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { sbiSelectorController } from './sbi.controller.js'
import { sbiStore } from './state.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('~/src/server/common/constants/status-codes.js', () => ({
  statusCodes: {
    ok: 200,
    methodNotAllowed: 405
  }
}))

vi.mock('./state.js', () => ({
  sbiStore: {
    set: vi.fn()
  }
}))

describe('sbiSelectorController', () => {
  let mockRequest
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()

    mockH = mockHapiResponseToolkit({
      response: vi.fn().mockReturnThis(),
      code: vi.fn().mockReturnThis()
    })
  })

  describe('POST requests', () => {
    beforeEach(() => {
      mockRequest = mockHapiRequest({
        method: 'post',
        payload: {
          sbi: 'test-sbi-value'
        }
      })
    })

    it('should successfully update SBI and return success message', () => {
      sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', 'test-sbi-value')
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })

    it('should handle empty SBI value', () => {
      mockRequest.payload.sbi = ''

      sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', '')
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })

    it('should handle null SBI value', () => {
      mockRequest.payload.sbi = null

      sbiSelectorController.handler(mockRequest, mockH)

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

      sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', complexSbi)
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })
  })

  describe('Non-POST requests', () => {
    it('should return method not allowed for GET requests', () => {
      mockRequest = mockHapiRequest({
        method: 'get',
        payload: {}
      })

      sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })

    it('should return method not allowed for PUT requests', () => {
      mockRequest = mockHapiRequest({
        method: 'put',
        payload: { sbi: 'test-value' }
      })

      sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })

    it('should return method not allowed for DELETE requests', () => {
      mockRequest = mockHapiRequest({
        method: 'delete',
        payload: {}
      })

      sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })

    it('should return method not allowed for PATCH requests', () => {
      mockRequest = mockHapiRequest({
        method: 'patch',
        payload: { sbi: 'test-value' }
      })

      sbiSelectorController.handler(mockRequest, mockH)

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
        // intentionally no payload property for this edge case test
      }

      expect(() => {
        sbiSelectorController.handler(mockRequest, mockH)
      }).toThrow()
    })

    it('should handle payload without sbi property', () => {
      mockRequest = mockHapiRequest({
        method: 'post',
        payload: {}
      })

      sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', undefined)
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })
  })

  describe('Response chaining', () => {
    it('should return the result of the response chain for POST requests', () => {
      mockRequest = mockHapiRequest({
        method: 'post',
        payload: { sbi: 'test-value' }
      })

      const result = sbiSelectorController.handler(mockRequest, mockH)

      expect(result).toBe(mockH)
    })

    it('should return the result of the response chain for non-POST requests', () => {
      mockRequest = {
        method: 'get',
        payload: {}
      }

      const result = sbiSelectorController.handler(mockRequest, mockH)

      expect(result).toBe(mockH)
    })
  })

  describe('sbiStore integration', () => {
    it('should call sbiStore.set with correct parameters only once per request', () => {
      mockRequest = mockHapiRequest({
        method: 'post',
        payload: { sbi: 'unique-sbi-value' }
      })

      sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledTimes(1)
      expect(sbiStore.set).toHaveBeenCalledWith('sbi', 'unique-sbi-value')
    })

    it('should not call sbiStore.set for non-POST requests', () => {
      mockRequest = mockHapiRequest({
        method: 'get',
        payload: { sbi: 'should-not-be-stored' }
      })

      sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
    })
  })
})
