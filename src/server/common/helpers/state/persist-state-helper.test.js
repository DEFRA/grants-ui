import { vi } from 'vitest'
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
import { mockRequestWithIdentity } from './mock-request-with-identity.test-helper.js'

const GRANT_VERSION = 1

const mockParseSessionKey = vi.fn()
vi.mock('./get-cache-key-helper.js', () => ({
  parseSessionKey: mockParseSessionKey
}))

global.fetch = vi.fn()

vi.doMock('../logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    SYSTEM: {
      EXTERNAL_API_CALL_DEBUG: { level: 'debug', messageFunc: vi.fn() },
      EXTERNAL_API_ERROR: { level: 'error', messageFunc: vi.fn() }
    }
  }
}))

let persistStateToApi
let log
let LogCodes

describe('persistStateToApi', () => {
  const key = { id: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}` }
  const testState = MOCK_STATE_DATA.WITH_STEP

  beforeEach(() => {
    mockParseSessionKey.mockReturnValue({
      userId: TEST_USER_IDS.DEFAULT,
      organisationId: TEST_USER_IDS.ORGANISATION_ID,
      grantId: TEST_USER_IDS.GRANT_ID
    })
  })

  describe('With backend configured correctly', () => {
    beforeEach(async () => {
      vi.resetModules()
      vi.doMock('~/src/config/config.js', createMockConfig)
      const helper = await import('~/src/server/common/helpers/state/persist-state-helper.js')
      persistStateToApi = helper.persistStateToApi
      const logModule = await import('../logging/log.js')
      log = logModule.log
      LogCodes = logModule.LogCodes
      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.unmock('~/src/config/config.js')
    })

    const createSuccessfulFetchResponse = () => ({
      ok: true,
      status: HTTP_STATUS.OK
    })

    const createFailedFetchResponse = (
      status = HTTP_STATUS.INTERNAL_SERVER_ERROR,
      statusText = 'Internal Server Error'
    ) => ({
      ok: false,
      status,
      statusText
    })

    it('persists state successfully when response is ok', async () => {
      fetch.mockResolvedValue(createSuccessfulFetchResponse())

      await persistStateToApi(testState, key)

      const expectedBody = JSON.stringify({
        userId: TEST_USER_IDS.DEFAULT,
        businessId: TEST_USER_IDS.ORGANISATION_ID,
        grantId: TEST_USER_IDS.GRANT_ID,
        grantVersion: GRANT_VERSION,
        state: testState
      })

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/state\/$/),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: expect.stringMatching(/^Basic [A-Za-z0-9+/]+=*$/)
          }),
          body: expectedBody
        })
      )

      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
        expect.objectContaining({
          endpoint: expect.stringContaining('/state/'),
          identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`,
          stateSummary: {
            hasReference: Boolean(testState?.$$__referenceNumber),
            keyCount: Object.keys(testState).length
          }
        })
      )
    })

    it('logs error when response is not ok', async () => {
      const failedResponse = createFailedFetchResponse()
      fetch.mockResolvedValue(failedResponse)

      await persistStateToApi(testState, key)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          endpoint: expect.stringContaining('/state/'),
          identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`,
          error: `${failedResponse.status} - ${failedResponse.statusText}`
        })
      )
    })

    it('logs error when fetch fails', async () => {
      const networkError = new Error(ERROR_MESSAGES.NETWORK_ERROR)
      fetch.mockRejectedValue(networkError)

      await persistStateToApi(testState, key)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          endpoint: expect.stringContaining('/state/'),
          identity: `${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`,
          error: networkError.message
        })
      )
    })
  })

  describe('With backend not configured', () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      vi.resetModules()
      vi.doMock('~/src/config/config.js', createMockConfigWithoutEndpoint)
      const helper = await import('~/src/server/common/helpers/state/persist-state-helper.js')
      persistStateToApi = helper.persistStateToApi
      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.unmock('~/src/config/config.js')
    })

    it('should return early when backend endpoint is not configured', async () => {
      const request = mockRequestWithIdentity({ params: { slug: TEST_USER_IDS.GRANT_ID } })
      request.logger = mockRequestLogger()
      const testState = () => MOCK_STATE_DATA.WITH_STEP

      await persistStateToApi(testState, request)

      expect(fetch).not.toHaveBeenCalled()
      expect(request.logger.info).not.toHaveBeenCalled()
      expect(request.logger.error).not.toHaveBeenCalled()
    })
  })
})
