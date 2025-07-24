import { jest } from '@jest/globals'

import { mockRequestWithIdentity } from './mock-request-with-identity.test-helper.js'

global.fetch = jest.fn()

let fetchSavedStateFromApi

describe('fetchSavedStateFromApi', () => {
  describe('With backend configured correctly', () => {
    beforeEach(async () => {
      process.env.GRANTS_UI_BACKEND_URL = 'http://localhost:3002'
      ;({ fetchSavedStateFromApi } = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js'))
      jest.clearAllMocks()
    })

    it('returns state when response is valid', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => ({ state: { foo: 'bar' } })
      })

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
      const result = await fetchSavedStateFromApi(request)

      expect(result).toHaveProperty('state')
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('returns null on 404', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => {
          throw new Error('No content')
        }
      })

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
      const result = await fetchSavedStateFromApi(request)

      expect(result).toBeNull()
    })

    it('returns null on non-200 (not 404)', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
      const result = await fetchSavedStateFromApi(request)

      expect(result).toBeNull()
    })

    it('returns null when response JSON is invalid or missing state', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => ({ invalid: true })
      })

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
      request.logger = { warn: jest.fn(), error: jest.fn() }

      const result = await fetchSavedStateFromApi(request)

      expect(result).toBeNull()
      expect(request.logger.warn).toHaveBeenCalledWith(
        ['fetch-saved-state'],
        'Unexpected or empty state format',
        expect.any(Object)
      )
    })

    it('returns null and logs error on fetch failure', async () => {
      fetch.mockRejectedValue(new Error('Network error'))

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
      request.logger = { error: jest.fn(), warn: jest.fn() }

      const result = await fetchSavedStateFromApi(request)

      expect(result).toBeNull()
      expect(request.logger.error).toHaveBeenCalledWith(
        ['fetch-saved-state'],
        'Failed to fetch saved state from API',
        expect.any(Error)
      )
    })
  })

  describe('Without backend configured', () => {
    it('returns null when endpoint is not defined', async () => {
      process.env.GRANTS_UI_BACKEND_URL = ''
      ;({ fetchSavedStateFromApi } = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js'))

      const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })

      const result = await fetchSavedStateFromApi(request)

      expect(result).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
