import { vi } from 'vitest'
import { mockRequestWithIdentity } from './mock-request-with-identity.test-helper.js'
import {
  MOCK_STATE_DATA,
  HTTP_STATUS,
  TEST_USER_IDS,
  ERROR_MESSAGES,
  LOG_MESSAGES,
  createMockConfig,
  createMockConfigWithoutEndpoint
} from './test-helpers/auth-test-helpers.js'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'

const LOG_TAGS = {
  FETCH_SAVED_STATE: 'fetch-saved-state'
}

global.fetch = vi.fn()

let fetchSavedStateFromApi

const mockRequest = mockRequestWithIdentity({ params: { slug: TEST_USER_IDS.GRANT_ID } })
const mockRequestWithLogger = {
  ...mockRequest,
  logger: mockRequestLogger()
}

const successfulResponse = {
  ok: true,
  json: () => MOCK_STATE_DATA.DEFAULT
}

const createFailedResponse = (status, statusText = 'Error') => ({
  ok: false,
  status,
  statusText,
  json: () => {
    throw new Error(ERROR_MESSAGES.NO_CONTENT)
  }
})

describe('fetchSavedStateFromApi', () => {
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
      fetch.mockResolvedValue(successfulResponse)

      const result = await fetchSavedStateFromApi(mockRequest)

      expect(result).toHaveProperty('state')
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('includes authorization header in fetch request', async () => {
      fetch.mockResolvedValue(successfulResponse)

      await fetchSavedStateFromApi(mockRequest)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `/state/\\?userId=${TEST_USER_IDS.DEFAULT}&businessId=${TEST_USER_IDS.BUSINESS_ID}&grantId=${TEST_USER_IDS.GRANT_ID}`
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
      fetch.mockResolvedValue(createFailedResponse(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND))

      const result = await fetchSavedStateFromApi(mockRequest)

      expect(result).toBeNull()
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('returns null on non-200 (not 404)', async () => {
      fetch.mockResolvedValue(
        createFailedResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.INTERNAL_SERVER_ERROR)
      )

      const result = await fetchSavedStateFromApi(mockRequest)

      expect(result).toBeNull()
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('returns null when response JSON is invalid or missing state', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => 123 })

      const result = await fetchSavedStateFromApi(mockRequestWithLogger)

      expect(result).toBeNull()
      expect(mockRequestWithLogger.logger.warn).toHaveBeenCalledWith(
        [LOG_TAGS.FETCH_SAVED_STATE],
        LOG_MESSAGES.UNEXPECTED_STATE_FORMAT,
        expect.any(Object)
      )
    })

    it('returns null and logs error on fetch failure', async () => {
      const networkError = new Error(ERROR_MESSAGES.NETWORK_ERROR)
      fetch.mockRejectedValue(networkError)

      const result = await fetchSavedStateFromApi(mockRequestWithLogger)

      expect(result).toBeNull()
      expect(mockRequestWithLogger.logger.error).toHaveBeenCalledWith(
        [LOG_TAGS.FETCH_SAVED_STATE],
        LOG_MESSAGES.FETCH_FAILED,
        networkError
      )
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
      const result = await fetchSavedStateFromApi(mockRequest)

      expect(result).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
