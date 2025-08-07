import { jest } from '@jest/globals'
import { mockRequestWithIdentity } from './mock-request-with-identity.test-helper.js'

const mockGetCacheKey = jest.fn()

jest.mock('~/src/server/common/helpers/state/get-cache-key-helper.js', () => ({
  getCacheKey: mockGetCacheKey
}))

global.fetch = jest.fn()

let persistStateToApi

describe('persistStateToApi', () => {
  beforeEach(() => {
    mockGetCacheKey.mockReturnValue({
      userId: 'user_test',
      businessId: 'biz_test',
      grantId: 'test-slug'
    })
  })

  describe('With backend configured correctly', () => {
    beforeEach(async () => {
      process.env.GRANTS_UI_BACKEND_URL = 'http://localhost:3002'
      ;({ persistStateToApi } = await import('~/src/server/common/helpers/state/persist-state-helper.js'))
      jest.clearAllMocks()
    })

    it('persists state successfully when response is ok', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 200
      })

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
      const testState = { foo: 'bar', step: 1 }

      await persistStateToApi(testState, request)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith('http://localhost:3002/state/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: 'user_test',
          businessId: 'biz_test',
          grantId: 'test-slug',
          grantVersion: 'v1', // TODO: Update when support for same grant versioning is implemented
          state: testState
        })
      })
      expect(request.logger.info).toHaveBeenCalledWith(
        'Persisting state to backend for identity: user_test:biz_test:test-slug'
      )
    })

    it('logs error when response is not ok', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500
      })

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
      const testState = { foo: 'bar' }

      await persistStateToApi(testState, request)

      expect(request.logger.error).toHaveBeenCalledWith({
        message: 'Failed to persist state to API',
        err: expect.any(Error)
      })
    })

    it('logs error when fetch fails', async () => {
      const networkError = new Error('Network error')
      fetch.mockRejectedValue(networkError)

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
      const testState = { foo: 'bar' }

      await persistStateToApi(testState, request)

      expect(request.logger.error).toHaveBeenCalledWith({
        message: 'Failed to persist state to API',
        err: networkError
      })
    })

    it('throws error when getCacheKey fails', async () => {
      mockGetCacheKey.mockImplementationOnce(() => {
        throw new Error('Network error')
      })
      const request = mockRequestWithIdentity({
        auth: { credentials: null },
        params: { slug: 'test-slug' }
      })
      const testState = { foo: 'bar' }

      await expect(persistStateToApi(testState, request)).rejects.toThrow('Network error')

      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('Without backend configured', () => {
    it('returns early when endpoint is not defined', async () => {
      process.env.GRANTS_UI_BACKEND_URL = ''
      ;({ persistStateToApi } = await import('~/src/server/common/helpers/state/persist-state-helper.js'))

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
      const testState = { foo: 'bar' }

      const result = await persistStateToApi(testState, request)

      expect(fetch).not.toHaveBeenCalled()
      expect(request.logger.info).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('throws error when endpoint is whitespace only', async () => {
      process.env.GRANTS_UI_BACKEND_URL = '   '
      ;({ persistStateToApi } = await import('~/src/server/common/helpers/state/persist-state-helper.js'))

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
      const testState = { foo: 'bar' }

      await expect(persistStateToApi(testState, request)).rejects.toThrow('Invalid URL')

      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
