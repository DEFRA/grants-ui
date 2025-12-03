import { vi } from 'vitest'
import {
  createMockConfig,
  createMockConfigWithoutEndpoint,
  ERROR_MESSAGES,
  HTTP_STATUS,
  MOCK_STATE_DATA,
  TEST_USER_IDS
} from './test-helpers/auth-test-helpers.js'
import { mockSimpleRequest } from '~/src/__mocks__/hapi-mocks.js'

const mockFetch = vi.hoisted(() => vi.fn())
global.fetch = mockFetch

const mockLog = vi.fn()

vi.mock('../logging/log.js', () => ({
  log: mockLog,
  LogCodes: {
    SYSTEM: {
      EXTERNAL_API_CALL_DEBUG: { level: 'debug', messageFunc: vi.fn() },
      EXTERNAL_API_ERROR: { level: 'error', messageFunc: vi.fn() }
    }
  }
}))

// Mock parseSessionKey
const mockParseSessionKey = vi.fn()
vi.mock('./get-cache-key-helper.js', () => ({
  parseSessionKey: mockParseSessionKey
}))

let fetchSavedStateFromApi
let clearSavedStateFromApi
let log
let LogCodes
let mockRequest

describe('State API helpers', () => {
  const key = `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`

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
    mockRequest = mockSimpleRequest()

    mockParseSessionKey.mockReturnValue({
      sbi: TEST_USER_IDS.ORGANISATION_ID,
      grantCode: TEST_USER_IDS.GRANT_ID
    })
  })

  describe('fetchSavedStateFromApi', () => {
    describe('With backend configured correctly', () => {
      beforeAll(async () => {
        vi.doMock('~/src/config/config.js', createMockConfig)
        const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
        fetchSavedStateFromApi = helper.fetchSavedStateFromApi
        clearSavedStateFromApi = helper.clearSavedStateFromApi
        log = (await import('../logging/log.js')).log
        LogCodes = (await import('../logging/log.js')).LogCodes
      })

      beforeEach(() => {
        vi.clearAllMocks()
      })

      afterAll(() => {
        vi.unmock('~/src/config/config.js')
      })

      it('returns state when response is valid', async () => {
        mockFetch.mockResolvedValue(createSuccessfulResponse())

        const result = await fetchSavedStateFromApi(key, mockRequest)

        expect(result).toHaveProperty('state')
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
          expect.objectContaining({
            method: 'GET',
            endpoint: expect.stringContaining('/state/'),
            identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`
          }),
          mockRequest
        )
      })

      it('includes authorization header in fetch request', async () => {
        mockFetch.mockResolvedValue(createSuccessfulResponse())

        await fetchSavedStateFromApi(key)

        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`/state/\\?sbi=${TEST_USER_IDS.ORGANISATION_ID}&grantCode=${TEST_USER_IDS.GRANT_ID}`)
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
        mockFetch.mockResolvedValue(createFailedResponse(HTTP_STATUS.NOT_FOUND))

        const result = await fetchSavedStateFromApi(key, mockRequest)

        expect(result).toBeNull()
        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
          expect.objectContaining({
            method: 'GET',
            endpoint: expect.stringContaining('/state/'),
            identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`,
            summary: 'No state found in backend'
          }),
          mockRequest
        )
      })

      it('throws error on non-200 (not 404)', async () => {
        mockFetch.mockResolvedValue(createFailedResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR))

        await expect(fetchSavedStateFromApi(key, mockRequest)).rejects.toThrow()

        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          expect.objectContaining({
            method: 'GET',
            endpoint: expect.stringContaining('/state/'),
            identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`,
            error: 'Failed to fetch saved state: 500'
          }),
          mockRequest
        )
      })

      it('throws error when response JSON is invalid or missing state', async () => {
        mockFetch.mockResolvedValue(createSuccessfulResponse(123))

        await expect(fetchSavedStateFromApi(key, mockRequest)).rejects.toThrow()

        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          expect.objectContaining({
            method: 'GET',
            endpoint: expect.stringContaining('/state/'),
            identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`,
            error: 'Unexpected or empty state format: 123'
          }),
          mockRequest
        )
      })

      it('throws and logs error on fetch failure', async () => {
        const networkError = new Error(ERROR_MESSAGES.NETWORK_ERROR)
        mockFetch.mockRejectedValue(networkError)

        await expect(fetchSavedStateFromApi(key, mockRequest)).rejects.toThrow()

        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          expect.objectContaining({
            method: 'GET',
            endpoint: expect.stringContaining('/state/'),
            identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`,
            errorMessage: 'Network error'
          }),
          mockRequest
        )
      })
    })

    describe('Without backend endpoint configured', () => {
      beforeAll(async () => {
        vi.resetModules()
        vi.doMock('~/src/config/config.js', createMockConfigWithoutEndpoint)
        const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
        fetchSavedStateFromApi = helper.fetchSavedStateFromApi
      })

      beforeEach(() => {
        vi.clearAllMocks()
      })

      afterAll(() => {
        vi.doUnmock('~/src/config/config.js')
      })

      it('returns null when GRANTS_UI_BACKEND_ENDPOINT is not configured', async () => {
        const result = await fetchSavedStateFromApi(key)

        expect(result).toBeNull()
        expect(mockFetch).not.toHaveBeenCalled()
      })
    })
  })

  describe('clearSavedStateFromApi', () => {
    describe('With backend configured correctly', () => {
      beforeAll(async () => {
        vi.resetModules()
        vi.doMock('~/src/config/config.js', createMockConfig)
        const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
        clearSavedStateFromApi = helper.clearSavedStateFromApi
        log = (await import('../logging/log.js')).log
        LogCodes = (await import('../logging/log.js')).LogCodes
      })

      beforeEach(() => {
        vi.clearAllMocks()
      })

      afterAll(() => {
        vi.unmock('~/src/config/config.js')
      })

      it('returns state when response is valid', async () => {
        mockFetch.mockResolvedValue(createSuccessfulResponse())

        const result = await clearSavedStateFromApi(key, mockRequest)

        expect(result).toHaveProperty('state')
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
          expect.objectContaining({
            method: 'DELETE',
            endpoint: expect.stringContaining('/state/'),
            identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`
          }),
          mockRequest
        )
      })

      it('includes authorization header in fetch request', async () => {
        mockFetch.mockResolvedValue(createSuccessfulResponse())

        await clearSavedStateFromApi(key)

        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(
            new RegExp(`/state/\\?sbi=${TEST_USER_IDS.ORGANISATION_ID}&grantCode=${TEST_USER_IDS.GRANT_ID}`)
          ),
          expect.objectContaining({
            method: 'DELETE',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              Authorization: expect.any(String)
            })
          })
        )
      })

      it('returns null on 404', async () => {
        mockFetch.mockResolvedValue(createFailedResponse(HTTP_STATUS.NOT_FOUND))

        const result = await clearSavedStateFromApi(key, mockRequest)

        expect(result).toBeNull()
        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
          expect.objectContaining({
            method: 'DELETE',
            endpoint: expect.stringContaining('/state/'),
            identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`,
            summary: 'No state found in backend'
          }),
          mockRequest
        )
      })

      it('throws error on non-200 response (not 404)', async () => {
        mockFetch.mockResolvedValue(createFailedResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR))

        await expect(clearSavedStateFromApi(key, mockRequest)).rejects.toThrow()

        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          expect.objectContaining({
            method: 'DELETE',
            endpoint: expect.stringContaining('/state/'),
            identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`,
            error: 'Failed to clear saved state: 500'
          }),
          mockRequest
        )
      })

      it('throws error when response JSON is invalid or missing state', async () => {
        mockFetch.mockResolvedValue(createSuccessfulResponse(123))

        await expect(clearSavedStateFromApi(key, mockRequest)).rejects.toThrow()

        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          expect.objectContaining({
            method: 'DELETE',
            endpoint: expect.stringContaining('/state/'),
            identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`,
            error: 'Unexpected or empty state format: 123'
          }),
          mockRequest
        )
      })

      it('throws error and logs on fetch failure', async () => {
        const networkError = new Error(ERROR_MESSAGES.NETWORK_ERROR)
        mockFetch.mockRejectedValue(networkError)

        await expect(clearSavedStateFromApi(key, mockRequest)).rejects.toThrow()

        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          expect.objectContaining({
            method: 'DELETE',
            endpoint: expect.stringContaining('/state/'),
            identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`,
            errorMessage: 'Network error'
          }),
          mockRequest
        )
      })
    })

    describe('Without backend endpoint configured', () => {
      beforeAll(async () => {
        vi.resetModules()
        vi.doMock('~/src/config/config.js', createMockConfigWithoutEndpoint)
        const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
        clearSavedStateFromApi = helper.clearSavedStateFromApi
      })

      beforeEach(() => {
        vi.clearAllMocks()
      })

      afterAll(() => {
        vi.doUnmock('~/src/config/config.js')
      })

      it('returns null when GRANTS_UI_BACKEND_ENDPOINT is not configured', async () => {
        const result = await clearSavedStateFromApi(key)

        expect(result).toBeNull()
        expect(mockFetch).not.toHaveBeenCalled()
      })
    })
  })
})
