import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { sbiSelectorController } from './sbi-selector.controller.js'
import { sbiStore } from './state.js'
import { performSessionHydration } from '~/src/server/index.js'

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

jest.mock('~/src/server/index.js', () => ({
  clearCachedKey: jest.fn(),
  performSessionHydration: jest.fn().mockResolvedValue(true)
}))

describe('sbiSelectorController', () => {
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
        },
        logger: {
          info: jest.fn(),
          error: jest.fn()
        },
        server: {}
      }
    })

    it('should successfully update SBI and return success message', async () => {
      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', 'test-sbi-value')
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })

    it('should handle empty SBI value', async () => {
      mockRequest.payload.sbi = ''

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', '')
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })

    it('should handle null SBI value', async () => {
      mockRequest.payload.sbi = null

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', null)
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })

    it('should handle complex SBI object', async () => {
      const complexSbi = {
        id: 123,
        name: 'Test SBI',
        config: { enabled: true }
      }
      mockRequest.payload.sbi = complexSbi

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', complexSbi)
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })

    it('should handle session hydration errors gracefully', async () => {
      const testError = new Error('Session hydration failed')
      performSessionHydration.mockRejectedValueOnce(testError)

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', 'test-sbi-value')
      expect(mockRequest.logger.error).toHaveBeenCalledWith(
        'Session hydration failed for SBI: test-sbi-value',
        testError
      )
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })
  })

  describe('Non-POST requests', () => {
    it('should return method not allowed for GET requests', async () => {
      mockRequest = {
        method: 'get',
        payload: {}
      }

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })

    it('should return method not allowed for PUT requests', async () => {
      mockRequest = {
        method: 'put',
        payload: { sbi: 'test-value' }
      }

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })

    it('should return method not allowed for DELETE requests', async () => {
      mockRequest = {
        method: 'delete',
        payload: {}
      }

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })

    it('should return method not allowed for PATCH requests', async () => {
      mockRequest = {
        method: 'patch',
        payload: { sbi: 'test-value' }
      }

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Method not allowed'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.methodNotAllowed)
    })
  })

  describe('Edge cases', () => {
    it('should handle missing payload', async () => {
      mockRequest = {
        method: 'post',
        logger: {
          info: jest.fn(),
          error: jest.fn()
        },
        server: {}
      }

      await expect(async () => {
        await sbiSelectorController.handler(mockRequest, mockH)
      }).rejects.toThrow()
    })

    it('should handle payload without sbi property', async () => {
      mockRequest = {
        method: 'post',
        payload: {},
        logger: {
          info: jest.fn(),
          error: jest.fn()
        },
        server: {}
      }

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledWith('sbi', undefined)
      expect(mockH.response).toHaveBeenCalledWith({
        message: 'SBI updated successfully'
      })
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    })
  })

  describe('Response chaining', () => {
    it('should return the result of the response chain for POST requests', async () => {
      mockRequest = {
        method: 'post',
        payload: { sbi: 'test-value' },
        logger: {
          info: jest.fn(),
          error: jest.fn()
        },
        server: {}
      }

      const result = await sbiSelectorController.handler(mockRequest, mockH)

      expect(result).toBe(mockH)
    })

    it('should return the result of the response chain for non-POST requests', async () => {
      mockRequest = {
        method: 'get',
        payload: {}
      }

      const result = await sbiSelectorController.handler(mockRequest, mockH)

      expect(result).toBe(mockH)
    })
  })

  describe('sbiStore integration', () => {
    it('should call sbiStore.set with correct parameters only once per request', async () => {
      mockRequest = {
        method: 'post',
        payload: { sbi: 'unique-sbi-value' },
        logger: {
          info: jest.fn(),
          error: jest.fn()
        },
        server: {}
      }

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).toHaveBeenCalledTimes(1)
      expect(sbiStore.set).toHaveBeenCalledWith('sbi', 'unique-sbi-value')
    })

    it('should not call sbiStore.set for non-POST requests', async () => {
      mockRequest = {
        method: 'get',
        payload: { sbi: 'should-not-be-stored' }
      }

      await sbiSelectorController.handler(mockRequest, mockH)

      expect(sbiStore.set).not.toHaveBeenCalled()
    })
  })
})
