import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearApplicationStateHandler } from './clear-application-state.handler.js'
import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'

import { findFormBySlug, loadFormDefinition } from '~/src/server/common/forms/services/find-form-by-slug.js'
import { clearSavedStateFromApiByContext } from '~/src/server/common/helpers/state/fetch-saved-state-helper.js'
import { mintLockToken } from '~/src/server/common/helpers/lock/lock-token.js'
import { log } from '../../common/helpers/logging/log.js'
import { YarKeys } from '~/src/server/common/constants/session-keys.js'

vi.mock('../../common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: vi.fn()
}))

vi.mock('~/src/server/common/forms/services/find-form-by-slug.js', () => ({
  findFormBySlug: vi.fn(),
  loadFormDefinition: vi.fn()
}))

vi.mock('~/src/server/common/helpers/state/fetch-saved-state-helper.js', () => ({
  clearSavedStateFromApiByContext: vi.fn()
}))

vi.mock('~/src/server/common/helpers/lock/lock-token.js', () => ({
  mintLockToken: vi.fn().mockReturnValue('mock-lock-token')
}))

vi.mock('../../common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: { SYSTEM: { SERVER_ERROR: 'SERVER_ERROR' } }
}))

describe('clearApplicationStateHandler', () => {
  let mockRequest
  let mockGetFormService
  let mockFormService
  let mockH
  let mockCacheService

  beforeEach(() => {
    vi.clearAllMocks()

    mockCacheService = {
      _Key: vi.fn().mockReturnValue('test-session-key'),
      clearState: vi.fn().mockResolvedValue(undefined)
    }

    getFormsCacheService.mockReturnValue(mockCacheService)

    mockFormService = vi.fn()
    mockGetFormService = vi.fn().mockReturnValue(mockFormService)
    mockRequest = {
      params: {},
      server: { methods: { getFormService: mockGetFormService } },
      app: { model: {} },
      logger: { warn: vi.fn() }
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

    it('should log error and still redirect when clearState fails', async () => {
      mockRequest.params.slug = 'test-slug'
      mockCacheService.clearState.mockRejectedValue(new Error('Cache clear failed'))

      const result = await clearApplicationStateHandler(mockRequest, mockH)

      expect(log).toHaveBeenCalledWith(
        'SERVER_ERROR',
        expect.objectContaining({ errorMessage: expect.stringContaining('Cache clear failed') }),
        mockRequest
      )
      expect(mockH.redirect).toHaveBeenCalledWith('/test-slug')
      expect(result).toEqual({ redirect: '/test-slug' })
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

  describe('when no slug is provided', () => {
    beforeEach(() => {
      mockRequest.params.slug = undefined
      mockRequest.auth = { credentials: { sbi: '123456789', contactId: 'contact-123' } }
      mockRequest.yar = {
        get: vi.fn().mockReturnValue({ grantCode: 'farm-payments', grantVersion: '2.0.0' }),
        clear: vi.fn()
      }
      clearSavedStateFromApiByContext.mockResolvedValue(undefined)
    })

    it('should call clearSavedStateFromApiByContext with grantCode and grantVersion from yar', async () => {
      await clearApplicationStateHandler(mockRequest, mockH)

      expect(mintLockToken).toHaveBeenCalledWith({
        userId: 'contact-123',
        sbi: '123456789',
        grantCode: 'farm-payments',
        grantVersion: '2.0.0'
      })
      expect(clearSavedStateFromApiByContext).toHaveBeenCalledWith({
        sbi: '123456789',
        grantCode: 'farm-payments',
        grantVersion: '2.0.0',
        lockToken: 'mock-lock-token'
      })
    })

    it('should clear GRANT_APPLICATION_CONTEXT from yar after successful clear', async () => {
      await clearApplicationStateHandler(mockRequest, mockH)

      expect(mockRequest.yar.clear).toHaveBeenCalledWith(YarKeys.GRANT_APPLICATION_CONTEXT)
    })

    it('should not clear yar when clearSavedStateFromApiByContext fails', async () => {
      clearSavedStateFromApiByContext.mockRejectedValue(new Error('API error'))

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(mockRequest.yar.clear).not.toHaveBeenCalled()
    })

    it('should not call clearSavedStateFromApiByContext when grantVersion is not set in yar', async () => {
      mockRequest.yar = { get: vi.fn().mockReturnValue({ grantCode: 'farm-payments' }), clear: vi.fn() }

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(clearSavedStateFromApiByContext).not.toHaveBeenCalled()
    })

    it('should not call clearSavedStateFromApiByContext when sbi is missing from credentials', async () => {
      mockRequest.auth = { credentials: { contactId: 'contact-123' } }

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(clearSavedStateFromApiByContext).not.toHaveBeenCalled()
    })

    it('should not call clearSavedStateFromApiByContext when auth is absent', async () => {
      mockRequest.auth = undefined

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(clearSavedStateFromApiByContext).not.toHaveBeenCalled()
    })

    it('should not call clearSavedStateFromApiByContext when contactId is absent', async () => {
      mockRequest.auth = { credentials: { sbi: '123456789' } }

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(clearSavedStateFromApiByContext).not.toHaveBeenCalled()
    })

    it('should not call clearSavedStateFromApiByContext when grantCode is not set in yar', async () => {
      mockRequest.yar = { get: vi.fn().mockReturnValue({ grantVersion: '2.0.0' }), clear: vi.fn() }

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(clearSavedStateFromApiByContext).not.toHaveBeenCalled()
    })

    it('should redirect to / by default', async () => {
      const result = await clearApplicationStateHandler(mockRequest, mockH)

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

  describe('when request.app.model is not set', () => {
    beforeEach(() => {
      mockRequest.app = {}
      mockRequest.params.slug = 'test-slug'
    })

    it('should call findFormBySlug with the slug when model is not set', async () => {
      const mockForm = { id: 'form-1' }
      const mockDefinition = { pages: [] }
      findFormBySlug.mockResolvedValue(mockForm)
      loadFormDefinition.mockResolvedValue(mockDefinition)

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(findFormBySlug).toHaveBeenCalledWith('test-slug')
      expect(loadFormDefinition).toHaveBeenCalledWith(mockForm, mockFormService)
      expect(mockRequest.app.model).toEqual({ def: mockDefinition })
    })

    it('should not call loadFormDefinition when findFormBySlug returns null', async () => {
      findFormBySlug.mockResolvedValue(null)

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(findFormBySlug).toHaveBeenCalledWith('test-slug')
      expect(loadFormDefinition).not.toHaveBeenCalled()
      expect(mockRequest.app.model).toBeUndefined()
    })

    it('should still clear state and redirect even when form is not found', async () => {
      findFormBySlug.mockResolvedValue(null)

      const result = await clearApplicationStateHandler(mockRequest, mockH)

      expect(mockCacheService.clearState).toHaveBeenCalledWith(mockRequest, true)
      expect(mockH.redirect).toHaveBeenCalledWith('/test-slug')
      expect(result).toEqual({ redirect: '/test-slug' })
    })
  })

  describe('when request.app.model is already set', () => {
    it('should skip findFormBySlug when model is already present', async () => {
      mockRequest.params.slug = 'test-slug'
      mockRequest.app.model = { def: { pages: [] } }

      await clearApplicationStateHandler(mockRequest, mockH)

      expect(findFormBySlug).not.toHaveBeenCalled()
      expect(loadFormDefinition).not.toHaveBeenCalled()
    })
  })

  describe('getFormsCacheService integration', () => {
    it('should call getFormsCacheService with correct server instance', async () => {
      const mockServer = { name: 'test-server', app: { formsService: { getFormDefinitionBySlug: vi.fn() } } }
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
