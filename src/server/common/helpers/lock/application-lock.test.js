import { vi } from 'vitest'
import { createApiHeadersForGrantsUiBackend } from '../auth/backend-auth-helper.js'
import { mintLockReleaseToken } from './lock-token.js'

global.fetch = vi.fn()

vi.mock('../auth/backend-auth-helper.js', () => ({
  createApiHeadersForGrantsUiBackend: vi.fn()
}))

vi.doMock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

vi.mock('./lock-token.js', () => ({
  mintLockReleaseToken: vi.fn()
}))

let releaseAllApplicationLocksForOwnerFromApi
let log
let LogCodes

describe('releaseAllApplicationLocksForOwnerFromApi', () => {
  const ownerId = 'user-123'

  describe('With backend configured correctly', () => {
    beforeEach(async () => {
      vi.resetModules()
      vi.doMock('~/src/config/config.js', () => ({
        config: {
          get: vi.fn(() => 'http://localhost:3000')
        }
      }))
      const helper = await import('./application-lock.js')
      releaseAllApplicationLocksForOwnerFromApi = helper.releaseAllApplicationLocksForOwnerFromApi
      const logModule = await import('~/src/server/common/helpers/logging/log.js')
      log = logModule.log
      LogCodes = logModule.LogCodes
      vi.clearAllMocks()
      createApiHeadersForGrantsUiBackend.mockReturnValue({ Authorization: 'Bearer token' })
      mintLockReleaseToken.mockReturnValue('lock-release-token')
    })

    afterEach(() => {
      vi.unmock('~/src/config/config.js')
    })

    it('calls the backend and returns releasedCount from JSON', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, releasedCount: 3 })
      })

      const result = await releaseAllApplicationLocksForOwnerFromApi({ ownerId })

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/application-locks',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'x-application-lock-release': 'lock-release-token'
          })
        })
      )

      expect(result).toEqual({ ok: true, releasedCount: 3 })
      expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG, expect.any(Object))
    })

    it('handles non-OK HTTP response', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn()
      })

      const result = await releaseAllApplicationLocksForOwnerFromApi({ ownerId })

      expect(result).toEqual({ ok: false, releasedCount: 0 })
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          errorMessage: '500 - Internal Server Error'
        })
      )
    })

    it('handles fetch throwing an error', async () => {
      fetch.mockRejectedValue(new Error('Network failure'))

      const result = await releaseAllApplicationLocksForOwnerFromApi({ ownerId })

      expect(result).toEqual({ ok: false, releasedCount: 0 })
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          errorMessage: 'Network failure'
        })
      )
    })

    it('handles backend returning invalid JSON', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON'))
      })

      const result = await releaseAllApplicationLocksForOwnerFromApi({ ownerId })

      expect(result).toEqual({ ok: true, releasedCount: 0 })
    })

    it('handles fetch being aborted (timeout)', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'

      fetch.mockRejectedValue(abortError)

      const result = await releaseAllApplicationLocksForOwnerFromApi({ ownerId })

      expect(result).toEqual({ ok: false, releasedCount: 0 })

      expect(log).toHaveBeenCalledWith(
        LogCodes.APPLICATION_LOCKS.RELEASE_TIMEOUT,
        expect.objectContaining({
          ownerId
        })
      )
    })
  })

  describe('With backend not configured', () => {
    beforeEach(async () => {
      vi.resetModules()

      vi.doMock('~/src/config/config.js', () => ({
        config: {
          get: vi.fn(() => '')
        }
      }))

      const helper = await import('./application-lock.js')
      releaseAllApplicationLocksForOwnerFromApi = helper.releaseAllApplicationLocksForOwnerFromApi

      const logModule = await import('~/src/server/common/helpers/logging/log.js')
      log = logModule.log

      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.unmock('~/src/config/config.js')
    })

    it('returns skipped=true and does not call fetch', async () => {
      const result = await releaseAllApplicationLocksForOwnerFromApi({ ownerId })

      expect(result).toEqual({
        ok: true,
        releasedCount: 0,
        skipped: true
      })

      expect(fetch).not.toHaveBeenCalled()
      expect(log).toHaveBeenCalled()
    })
  })
})
