import { describe, it, expect, beforeEach, vi } from 'vitest'
import { clearApplicationStateHandler } from './clear-application-state.handler.js'
import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'

vi.mock('../../common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: vi.fn()
}))

describe('clearApplicationStateHandler', () => {
  let mockRequest
  let mockH
  let mockCacheService

  beforeEach(() => {
    vi.clearAllMocks()

    mockCacheService = {
      clearState: vi.fn().mockResolvedValue(undefined)
    }

    getFormsCacheService.mockReturnValue(mockCacheService)

    mockRequest = {
      params: {},
      server: {}
    }

    mockH = {
      redirect: vi.fn((url) => ({ redirect: url }))
    }
  })

  describe('when slug is provided', () => {
    it('should clear state and redirect to slug path', async () => {
      mockRequest.params.slug = 'my-application'

      const result = await clearApplicationStateHandler(mockRequest, mockH)

      expect(getFormsCacheService).toHaveBeenCalledWith(mockRequest.server)
      expect(mockCacheService.clearState).toHaveBeenCalledWith(mockRequest, true)
      expect(mockH.redirect).toHaveBeenCalledWith('/my-application')
      expect(result).toEqual({ redirect: '/my-application' })
    })

    it('should handle different slug values', async () => {
      const slugs = ['test', 'another-slug', '123', 'application-form']

      for (const slug of slugs) {
        vi.clearAllMocks()
        mockRequest.params.slug = slug

        await clearApplicationStateHandler(mockRequest, mockH)

        expect(mockCacheService.clearState).toHaveBeenCalledWith(mockRequest, true)
        expect(mockH.redirect).toHaveBeenCalledWith(`/${slug}`)
      }
    })

    it('should pass correct parameters to clearState', async () => {
      mockRequest.params.slug = 'test-slug'

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(mockCacheService.clearState).toHaveBeenCalledTimes(1)
      expect(mockCacheService.clearState).toHaveBeenCalledWith(mockRequest, true)
    })

    it('should handle clearState errors', async () => {
      mockRequest.params.slug = 'test-slug'
      const error = new Error('Cache clear failed')
      mockCacheService.clearState.mockRejectedValue(error)

      await expect(clearApplicationStateHandler(mockRequest, mockH)).rejects.toThrow('Cache clear failed')
    })
  })

  describe('when slug is not provided', () => {
    it('should not clear state when params.slug is undefined', async () => {
      mockRequest.params.slug = undefined

      const result = await clearApplicationStateHandler(mockRequest, mockH)

      expect(getFormsCacheService).not.toHaveBeenCalled()
      expect(mockCacheService.clearState).not.toHaveBeenCalled()
      expect(mockH.redirect).toHaveBeenCalledWith('/')
      expect(result).toEqual({ redirect: '/' })
    })

    it('should not clear state when params.slug is empty string', async () => {
      mockRequest.params.slug = ''

      const result = await clearApplicationStateHandler(mockRequest, mockH)

      expect(getFormsCacheService).not.toHaveBeenCalled()
      expect(mockCacheService.clearState).not.toHaveBeenCalled()
      expect(mockH.redirect).toHaveBeenCalledWith('/')
      expect(result).toEqual({ redirect: '/' })
    })

    it('should not clear state when params is undefined', async () => {
      mockRequest.params = undefined

      const result = await clearApplicationStateHandler(mockRequest, mockH)

      expect(getFormsCacheService).not.toHaveBeenCalled()
      expect(mockCacheService.clearState).not.toHaveBeenCalled()
      expect(mockH.redirect).toHaveBeenCalledWith('/')
      expect(result).toEqual({ redirect: '/' })
    })

    it('should not clear state when params is null', async () => {
      mockRequest.params = null

      const result = await clearApplicationStateHandler(mockRequest, mockH)

      expect(getFormsCacheService).not.toHaveBeenCalled()
      expect(mockCacheService.clearState).not.toHaveBeenCalled()
      expect(mockH.redirect).toHaveBeenCalledWith('/')
      expect(result).toEqual({ redirect: '/' })
    })
  })

  describe('edge cases', () => {
    it('should handle slug with special characters', async () => {
      mockRequest.params.slug = 'my-app-123'

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(mockCacheService.clearState).toHaveBeenCalledWith(mockRequest, true)
      expect(mockH.redirect).toHaveBeenCalledWith('/my-app-123')
    })

    it('should handle slug with url-encoded characters', async () => {
      mockRequest.params.slug = 'my%20app'

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(mockCacheService.clearState).toHaveBeenCalledWith(mockRequest, true)
      expect(mockH.redirect).toHaveBeenCalledWith('/my%20app')
    })

    it('should await clearState before redirecting', async () => {
      mockRequest.params.slug = 'test'
      const callOrder = []

      mockCacheService.clearState.mockImplementation(async () => {
        callOrder.push('clearState')
      })

      mockH.redirect.mockImplementation((url) => {
        callOrder.push('redirect')
        return { redirect: url }
      })

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(callOrder).toEqual(['clearState', 'redirect'])
    })
  })

  describe('getFormsCacheService integration', () => {
    it('should call getFormsCacheService with correct server instance', async () => {
      const mockServer = { name: 'test-server' }
      mockRequest.server = mockServer
      mockRequest.params.slug = 'test'

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(getFormsCacheService).toHaveBeenCalledWith(mockServer)
      expect(getFormsCacheService).toHaveBeenCalledTimes(1)
    })

    it('should use the cache service returned by getFormsCacheService', async () => {
      const customCacheService = {
        clearState: vi.fn().mockResolvedValue(undefined)
      }
      getFormsCacheService.mockReturnValue(customCacheService)
      mockRequest.params.slug = 'test'

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(customCacheService.clearState).toHaveBeenCalled()
      expect(mockCacheService.clearState).not.toHaveBeenCalled()
    })
  })
})
