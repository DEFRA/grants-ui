import { jest } from '@jest/globals'
import { mockRequestWithIdentity } from './mock-request-with-identity.test-helper.js'
import {
  MOCK_STATE_DATA,
  HTTP_STATUS,
  TEST_USER_IDS,
  ERROR_MESSAGES,
  LOG_MESSAGES,
  createMockConfig
} from './test-helpers/auth-test-helpers.js'

const GRANT_VERSION = 1

const mockGetCacheKey = jest.fn()

jest.mock('~/src/server/common/helpers/state/get-cache-key-helper.js', () => ({
  getCacheKey: mockGetCacheKey
}))

global.fetch = jest.fn()

let persistStateToApi

describe('persistStateToApi', () => {
  const createMockRequest = () => mockRequestWithIdentity({ params: { slug: TEST_USER_IDS.GRANT_ID } })

  const createMockRequestWithLogger = () => {
    const request = createMockRequest()
    request.logger = { info: jest.fn(), error: jest.fn() }
    return request
  }

  const createTestState = () => MOCK_STATE_DATA.WITH_STEP

  const setupMockCacheKey = () => {
    mockGetCacheKey.mockReturnValue({
      userId: TEST_USER_IDS.DEFAULT,
      businessId: TEST_USER_IDS.BUSINESS_ID,
      grantId: TEST_USER_IDS.GRANT_ID
    })
  }

  beforeEach(() => {
    setupMockCacheKey()
  })

  describe('With backend configured correctly', () => {
    beforeEach(async () => {
      jest.resetModules()
      jest.doMock('~/src/config/config.js', createMockConfig)
      const helper = await import('~/src/server/common/helpers/state/persist-state-helper.js')
      persistStateToApi = helper.persistStateToApi
      setupMockCacheKey()
      jest.clearAllMocks()
    })

    afterEach(() => {
      jest.dontMock('~/src/config/config.js')
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

      const request = createMockRequest()
      const testState = createTestState()

      await persistStateToApi(testState, request)

      const expectedBody = JSON.stringify({
        userId: TEST_USER_IDS.DEFAULT,
        businessId: TEST_USER_IDS.BUSINESS_ID,
        grantId: TEST_USER_IDS.GRANT_ID,
        grantVersion: GRANT_VERSION, // TODO: Update when support for same grant versioning is implemented
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

      expect(request.logger.info).toHaveBeenCalledWith(
        `Persisting state to backend for identity: ${TEST_USER_IDS.DEFAULT}:${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`
      )
    })

    it('logs error when response is not ok', async () => {
      const failedResponse = createFailedFetchResponse()
      fetch.mockResolvedValue(failedResponse)

      const request = createMockRequestWithLogger()
      const testState = createTestState()

      await persistStateToApi(testState, request)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(request.logger.error).toHaveBeenCalledWith(
        `${LOG_MESSAGES.PERSIST_FAILED}: ${failedResponse.status} - ${failedResponse.statusText}`
      )
    })

    it('logs error when fetch fails', async () => {
      const networkError = new Error(ERROR_MESSAGES.NETWORK_ERROR)
      fetch.mockRejectedValue(networkError)

      const request = createMockRequestWithLogger()
      const testState = createTestState()

      await persistStateToApi(testState, request)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(request.logger.error).toHaveBeenCalledWith(`${LOG_MESSAGES.PERSIST_FAILED}: ${networkError.message}`)
    })
  })
})
