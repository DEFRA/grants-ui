import { vi } from 'vitest'
import {
  createMockConfig,
  createMockConfigWithoutEndpoint,
  ERROR_MESSAGES,
  HTTP_STATUS,
  MOCK_STATE_DATA,
  TEST_USER_IDS
} from './test-helpers/auth-test-helpers.js'

const GRANT_VERSION = 1

const mockParseSessionKey = vi.fn()
vi.mock('./get-cache-key-helper.js', () => ({
  parseSessionKey: mockParseSessionKey
}))

global.fetch = vi.fn()

vi.doMock('../logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

let persistStateToApi
let log
let LogCodes

describe('persistStateToApi', () => {
  const key = `${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`
  const testState = MOCK_STATE_DATA.WITH_STEP

  beforeEach(() => {
    mockParseSessionKey.mockReturnValue({
      sbi: TEST_USER_IDS.ORGANISATION_ID,
      grantCode: TEST_USER_IDS.GRANT_ID
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
        sbi: TEST_USER_IDS.ORGANISATION_ID,
        grantCode: TEST_USER_IDS.GRANT_ID,
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
            Authorization: expect.stringMatching(/^Bearer [A-Za-z0-9+/]+=*$/)
          }),
          body: expectedBody
        })
      )

      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
        expect.objectContaining({
          endpoint: expect.stringContaining('/state/'),
          identity: `${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`,
          summary: {
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
          identity: `${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`,
          errorMessage: `${failedResponse.status} - ${failedResponse.statusText}`
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
          identity: `${TEST_USER_IDS.BUSINESS_ID}:${TEST_USER_IDS.GRANT_ID}`,
          errorMessage: networkError.message
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
      const logModule = await import('../logging/log.js')
      log = logModule.log
      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.unmock('~/src/config/config.js')
    })

    it('should return early when backend endpoint is not configured', async () => {
      const testState = MOCK_STATE_DATA.WITH_STEP

      await persistStateToApi(testState, key)

      expect(fetch).not.toHaveBeenCalled()
      expect(log).not.toHaveBeenCalled()
    })
  })
})
