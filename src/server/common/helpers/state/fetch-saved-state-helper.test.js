import { vi } from 'vitest'
import { mockRequestWithIdentity } from './mock-request-with-identity.test-helper.js'
import {
  MOCK_STATE_DATA,
  HTTP_STATUS,
  ERROR_MESSAGES,
  createMockConfig,
  createMockConfigWithoutEndpoint
} from './test-helpers/auth-test-helpers.js'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'

global.fetch = vi.fn()

const mockLogger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

vi.mock('../logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

// Mock parseSessionKey
vi.mock('./get-cache-key-helper.js', () => ({
  parseSessionKey: vi.fn(() => ({
    userId: 'user-1',
    businessId: 'business-1',
    grantId: 'grant-1'
  }))
}))

let fetchSavedStateFromApi

describe('fetchSavedStateFromApi', () => {
  const key = { id: 'user-1:business-1:grant-1' }

  const createSuccessfulResponse = (data = MOCK_STATE_DATA.DEFAULT) => ({
    ok: true,
    json: () => data
  })
  const createFailedResponse = (status, statusText = 'Error') => ({
    ok: false,
    status,
    statusText,
    json: () => {
      throw new Error(ERROR_MESSAGES.NO_CONTENT)
    }
  })

  describe('With backend configured correctly', () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      vi.resetModules()
      vi.doMock('~/src/config/config.js', createMockConfig)
      const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
      fetchSavedStateFromApi = helper.fetchSavedStateFromApi
    })

    afterEach(() => {
      vi.doUnmock('~/src/config/config.js')
    })

    it('returns state when response is valid', async () => {
      fetch.mockResolvedValue(createSuccessfulResponse())

      const result = await fetchSavedStateFromApi(key)

      expect(result).toHaveProperty('state')
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(mockLogger.debug).toHaveBeenCalled()
    })

    it('includes authorization header in fetch request', async () => {
      fetch.mockResolvedValue(createSuccessfulResponse())

      await fetchSavedStateFromApi(key)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `/state/\\?userId=${TEST_USER_IDS.DEFAULT}&businessId=${TEST_USER_IDS.ORGANISATION_ID}&grantId=${TEST_USER_IDS.GRANT_ID}`
          )
        ),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: expect.any(String)
          })
        })
      )
    })

    it('returns null on 404', async () => {
      fetch.mockResolvedValue(createFailedResponse(HTTP_STATUS.NOT_FOUND))

      const result = await fetchSavedStateFromApi(key)

      expect(result).toBeNull()
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('No state found'))
    })

    it('returns null on non-200 (not 404)', async () => {
      fetch.mockResolvedValue(createFailedResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR))

      const result = await fetchSavedStateFromApi(key)

      expect(result).toBeNull()
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('returns null when response JSON is invalid', async () => {
      fetch.mockResolvedValue(createSuccessfulResponse(123))

      const result = await fetchSavedStateFromApi(key)

      expect(result).toBeNull()
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected or empty state format'))
    })

    it('returns null and logs error on fetch failure', async () => {
      const networkError = new Error(ERROR_MESSAGES.NETWORK_ERROR)
      fetch.mockRejectedValue(networkError)

      const result = await fetchSavedStateFromApi(key)

      expect(result).toBeNull()
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('fetch-saved-state'))
    })
  })

  describe('Without backend endpoint configured', () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      vi.resetModules()
      vi.doMock('~/src/config/config.js', createMockConfigWithoutEndpoint)
      const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
      fetchSavedStateFromApi = helper.fetchSavedStateFromApi
    })

    afterEach(() => {
      vi.doUnmock('~/src/config/config.js')
    })

    it('returns null when GRANTS_UI_BACKEND_ENDPOINT is not configured', async () => {
      const result = await fetchSavedStateFromApi(key)

      expect(result).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
