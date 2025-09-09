import { vi } from 'vitest'
import {
  MOCK_STATE_DATA,
  HTTP_STATUS,
  TEST_USER_IDS,
  ERROR_MESSAGES,
  createMockConfig,
  createMockConfigWithoutEndpoint
} from './test-helpers/auth-test-helpers.js'

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
const mockParseSessionKey = vi.fn()
vi.mock('./get-cache-key-helper.js', () => ({
  parseSessionKey: mockParseSessionKey
}))

let fetchSavedStateFromApi
let log
let LogCodes

describe('fetchSavedStateFromApi', () => {
  const key = { id: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}` }

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

  beforeEach(() => {
    mockParseSessionKey.mockReturnValue({
      userId: TEST_USER_IDS.DEFAULT,
      businessId: TEST_USER_IDS.BUSINESS_ID,
      grantId: TEST_USER_IDS.GRANT_ID
    })
  })

  describe('With backend configured correctly', () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      vi.resetModules()
      vi.doMock('~/src/config/config.js', createMockConfig)
      vi.doMock('../logging/log.js', () => ({
        log: vi.fn(),
        LogCodes: {
          SYSTEM: {
            EXTERNAL_API_CALL_DEBUG: { level: 'debug', messageFunc: vi.fn() },
            EXTERNAL_API_ERROR: { level: 'error', messageFunc: vi.fn() }
          }
        }
      }))
      const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
      fetchSavedStateFromApi = helper.fetchSavedStateFromApi
      log = (await import('../logging/log.js')).log
      LogCodes = (await import('../logging/log.js')).LogCodes
    })

    afterEach(() => {
      vi.doUnmock('~/src/config/config.js')
    })

    it('returns state when response is valid', async () => {
      fetch.mockResolvedValue(createSuccessfulResponse())

      const result = await fetchSavedStateFromApi(key)

      expect(result).toHaveProperty('state')
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
        expect.objectContaining({
          endpoint: expect.stringContaining('/state/'),
          identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`
        })
      )
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
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
        expect.objectContaining({
          endpoint: expect.stringContaining('/state/'),
          identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`,
          stateSummary: 'No state found in backend'
        })
      )
    })

    it('returns null on non-200 (not 404)', async () => {
      fetch.mockResolvedValue(createFailedResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR))

      const result = await fetchSavedStateFromApi(key)

      expect(result).toBeNull()
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          endpoint: expect.stringContaining('/state/'),
          identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`,
          error: 'Failed to fetch saved state: 500'
        })
      )
    })

    it('returns null when response JSON is invalid', async () => {
      fetch.mockResolvedValue(createSuccessfulResponse(123))

      const result = await fetchSavedStateFromApi(key)

      expect(result).toBeNull()
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          endpoint: expect.stringContaining('/state/'),
          identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`,
          error: 'Unexpected or empty state format: 123'
        })
      )
    })

    it('returns null and logs error on fetch failure', async () => {
      const networkError = new Error(ERROR_MESSAGES.NETWORK_ERROR)
      fetch.mockRejectedValue(networkError)

      const result = await fetchSavedStateFromApi(key)

      expect(result).toBeNull()
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          endpoint: expect.stringContaining('/state/'),
          identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`,
          error: 'Network error'
        })
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
      const result = await fetchSavedStateFromApi(key)

      expect(result).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
