import { vi } from 'vitest'
import {
  createMockConfig,
  createMockConfigWithoutEndpoint,
  ERROR_MESSAGES,
  HTTP_STATUS,
  MOCK_STATE_DATA,
  TEST_USER_IDS,
  TEST_BACKEND_URL
} from './test-helpers/auth-test-helpers.js'
import { mockSimpleRequest, createMockFetchResponse } from '~/src/__mocks__/hapi-mocks.js'
import { createApiHeadersForGrantsUiBackend } from '../auth/backend-auth-helper.js'
vi.mock('../auth/backend-auth-helper.js', () => ({
  createApiHeadersForGrantsUiBackend: vi.fn(({ lockToken }) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${Buffer.from('test').toString('base64')}`
  }))
}))

const mockFetch = vi.hoisted(() => vi.fn())
global.fetch = mockFetch

vi.mock('../logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

// Mock parseSessionKey
const mockParseSessionKey = vi.fn()
vi.mock('./get-cache-key-helper.js', () => ({
  parseSessionKey: mockParseSessionKey
}))

let fetchStateWithDefinitionFromApi
let clearSavedStateFromApi
let log
let LogCodes
let mockRequest

describe('State API helpers', () => {
  const key = `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`

  beforeEach(() => {
    mockRequest = mockSimpleRequest()

    mockParseSessionKey.mockReturnValue({
      sbi: TEST_USER_IDS.ORGANISATION_ID,
      grantCode: TEST_USER_IDS.GRANT_ID
    })
  })

  describe('fetchStateWithDefinitionFromApi', () => {
    describe('With backend configured correctly', () => {
      beforeAll(async () => {
        vi.doMock('~/src/config/config.js', createMockConfig)
        const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
        fetchStateWithDefinitionFromApi = helper.fetchStateWithDefinitionFromApi
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

      it('POSTs to /state/with-definition and returns the envelope', async () => {
        const envelope = { definition: { major: 1, minor: 0, patch: 0 }, state: { foo: 'bar' }, upgraded: false }
        mockFetch.mockResolvedValue(createMockFetchResponse({ data: envelope }))

        const result = await fetchStateWithDefinitionFromApi(key, mockRequest, { lockToken: 'tok' })

        expect(result).toEqual(envelope)
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/state/with-definition'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              Authorization: expect.any(String)
            }),
            body: JSON.stringify({
              sbi: TEST_USER_IDS.ORGANISATION_ID,
              grantCode: TEST_USER_IDS.GRANT_ID,
              includeDefinition: true
            })
          })
        )
        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
          expect.objectContaining({
            method: 'POST',
            endpoint: expect.stringContaining('/state/with-definition')
          }),
          mockRequest
        )
      })

      it('sends includeDefinition: false when requested (state-only)', async () => {
        mockFetch.mockResolvedValue(createMockFetchResponse({ data: { state: null, upgraded: false } }))

        await fetchStateWithDefinitionFromApi(key, mockRequest, { lockToken: 'tok', includeDefinition: false })

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/state/with-definition'),
          expect.objectContaining({
            body: JSON.stringify({
              sbi: TEST_USER_IDS.ORGANISATION_ID,
              grantCode: TEST_USER_IDS.GRANT_ID,
              includeDefinition: false
            })
          })
        )
      })

      it('returns null on 404', async () => {
        mockFetch.mockResolvedValue(createMockFetchResponse({ ok: false, status: HTTP_STATUS.NOT_FOUND }))

        const result = await fetchStateWithDefinitionFromApi(key, mockRequest)

        expect(result).toBeNull()
        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
          expect.objectContaining({
            method: 'POST',
            endpoint: expect.stringContaining('/state/with-definition'),
            summary: 'No form definition found'
          }),
          mockRequest
        )
      })

      it('throws a Boom error on 423 Locked', async () => {
        mockFetch.mockResolvedValue(createMockFetchResponse({ ok: false, status: 423 }))

        const error = await fetchStateWithDefinitionFromApi(key, mockRequest).catch((e) => e)

        expect(error.isBoom).toBe(true)
        expect(error.output.statusCode).toBe(423)
      })

      it('throws error on non-200 (not 404)', async () => {
        mockFetch.mockResolvedValue(createMockFetchResponse({ ok: false, status: HTTP_STATUS.INTERNAL_SERVER_ERROR }))

        await expect(fetchStateWithDefinitionFromApi(key, mockRequest)).rejects.toThrow()

        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          expect.objectContaining({
            method: 'POST',
            endpoint: expect.stringContaining('/state/with-definition'),
            error: 'Failed to fetch state with definition: 500'
          }),
          mockRequest
        )
      })

      it('throws error when response JSON is invalid', async () => {
        mockFetch.mockResolvedValue(createMockFetchResponse({ data: 123 }))

        await expect(fetchStateWithDefinitionFromApi(key, mockRequest)).rejects.toThrow()

        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          expect.objectContaining({
            method: 'POST',
            endpoint: expect.stringContaining('/state/with-definition'),
            error: 'Unexpected or empty state-with-definition format: 123'
          }),
          mockRequest
        )
      })

      it('throws and logs error on fetch failure', async () => {
        const networkError = new Error(ERROR_MESSAGES.NETWORK_ERROR)
        mockFetch.mockRejectedValue(networkError)

        await expect(fetchStateWithDefinitionFromApi(key, mockRequest)).rejects.toThrow()

        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          expect.objectContaining({
            method: 'POST',
            endpoint: expect.stringContaining('/state/with-definition'),
            errorMessage: 'Network error'
          }),
          mockRequest
        )
      })

      it('passes the lockToken to createApiHeadersForGrantsUiBackend', async () => {
        const lockToken = 'LOCK-TOKEN-123'
        mockFetch.mockResolvedValue(createMockFetchResponse({ data: { state: null, upgraded: false } }))

        await fetchStateWithDefinitionFromApi(key, mockRequest, { lockToken })

        expect(createApiHeadersForGrantsUiBackend).toHaveBeenCalledWith({ lockToken })
      })
    })

    describe('Without backend endpoint configured', () => {
      beforeAll(async () => {
        vi.resetModules()
        vi.doMock('~/src/config/config.js', createMockConfigWithoutEndpoint)
        const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
        fetchStateWithDefinitionFromApi = helper.fetchStateWithDefinitionFromApi
      })

      beforeEach(() => {
        vi.clearAllMocks()
      })

      afterAll(() => {
        vi.doUnmock('~/src/config/config.js')
      })

      it('returns null when GRANTS_UI_BACKEND_ENDPOINT is not configured', async () => {
        const result = await fetchStateWithDefinitionFromApi(key, mockRequest)

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
        mockFetch.mockResolvedValue(createMockFetchResponse({ data: MOCK_STATE_DATA.DEFAULT }))

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
        mockFetch.mockResolvedValue(createMockFetchResponse({ data: MOCK_STATE_DATA.DEFAULT }))

        await clearSavedStateFromApi(key, mockRequest)

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
        mockFetch.mockResolvedValue(createMockFetchResponse({ ok: false, status: HTTP_STATUS.NOT_FOUND }))

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
        mockFetch.mockResolvedValue(createMockFetchResponse({ ok: false, status: HTTP_STATUS.INTERNAL_SERVER_ERROR }))

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
        mockFetch.mockResolvedValue(createMockFetchResponse({ data: 123 }))

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

      it('passes the lockToken to createApiHeadersForGrantsUiBackend', async () => {
        const lockToken = 'LOCK-TOKEN-123'
        mockFetch.mockResolvedValue(createMockFetchResponse({ data: MOCK_STATE_DATA.DEFAULT }))

        await clearSavedStateFromApi(key, mockRequest, { lockToken })

        expect(createApiHeadersForGrantsUiBackend).toHaveBeenCalledWith({ lockToken })
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
        const result = await clearSavedStateFromApi(key, mockRequest)

        expect(result).toBeNull()
        expect(mockFetch).not.toHaveBeenCalled()
      })
    })
  })

  describe('clearSavedStateFromApiByContext', () => {
    let clearSavedStateFromApiByContext

    describe('With backend configured correctly', () => {
      beforeAll(async () => {
        vi.resetModules()
        vi.doMock('~/src/config/config.js', createMockConfig)
        const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
        clearSavedStateFromApiByContext = helper.clearSavedStateFromApiByContext
      })

      beforeEach(() => {
        vi.clearAllMocks()
      })

      afterAll(() => {
        vi.doUnmock('~/src/config/config.js')
      })

      it('calls DELETE /state/ with sbi, grantCode, grantVersion and lock token', async () => {
        mockFetch.mockResolvedValue(createMockFetchResponse({ ok: true, status: HTTP_STATUS.OK, data: {} }))

        await clearSavedStateFromApiByContext({
          sbi: '123456789',
          grantCode: 'farm-payments',
          grantVersion: '2.0.0',
          lockToken: 'test-lock-token'
        })

        expect(mockFetch).toHaveBeenCalledWith(
          `${TEST_BACKEND_URL}/state/?sbi=123456789&grantCode=farm-payments&grantVersion=2.0.0`,
          expect.objectContaining({ method: 'DELETE' })
        )
        expect(createApiHeadersForGrantsUiBackend).toHaveBeenCalledWith({ lockToken: 'test-lock-token' })
      })

      it('resolves without throwing on 404', async () => {
        mockFetch.mockResolvedValue(createMockFetchResponse({ ok: false, status: HTTP_STATUS.NOT_FOUND }))

        await expect(
          clearSavedStateFromApiByContext({
            sbi: '123456789',
            grantCode: 'farm-payments',
            grantVersion: '1.0.0',
            lockToken: 'tok'
          })
        ).resolves.toBeUndefined()
      })

      it('throws on non-404 error response', async () => {
        mockFetch.mockResolvedValue(createMockFetchResponse({ ok: false, status: HTTP_STATUS.INTERNAL_SERVER_ERROR }))

        await expect(
          clearSavedStateFromApiByContext({
            sbi: '123456789',
            grantCode: 'farm-payments',
            grantVersion: '1.0.0',
            lockToken: 'tok'
          })
        ).rejects.toThrow()
      })
    })

    describe('Without backend endpoint configured', () => {
      beforeAll(async () => {
        vi.resetModules()
        vi.doMock('~/src/config/config.js', createMockConfigWithoutEndpoint)
        const helper = await import('~/src/server/common/helpers/state/fetch-saved-state-helper.js?t=' + Date.now())
        clearSavedStateFromApiByContext = helper.clearSavedStateFromApiByContext
      })

      beforeEach(() => {
        vi.clearAllMocks()
      })

      afterAll(() => {
        vi.doUnmock('~/src/config/config.js')
      })

      it('returns without calling fetch when endpoint is not configured', async () => {
        await expect(
          clearSavedStateFromApiByContext({
            sbi: '123456789',
            grantCode: 'farm-payments',
            grantVersion: '1.0.0',
            lockToken: 'tok'
          })
        ).resolves.toBeUndefined()

        expect(mockFetch).not.toHaveBeenCalled()
      })
    })
  })
})
