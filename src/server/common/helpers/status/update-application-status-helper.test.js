import { vi } from 'vitest'
import {
  createMockConfig,
  createMockConfigWithoutEndpoint,
  HTTP_STATUS,
  TEST_BACKEND_URL,
  TEST_USER_IDS
} from '../state/test-helpers/auth-test-helpers.js'

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

const mockCreateApiHeaders = vi.fn().mockReturnValue({
  'Content-Type': 'application/json',
  Authorization: 'Bearer test-token'
})
vi.doMock('../state/backend-auth-helper.js', () => ({
  createApiHeadersForGrantsUiBackend: mockCreateApiHeaders
}))

const mockParseSessionKey = vi.fn()
vi.doMock('../state/get-cache-key-helper.js', () => ({
  parseSessionKey: mockParseSessionKey
}))

let updateApplicationStatus
let log
let LogCodes

const APPLICATION_STATUS = 'SUBMITTED'
const KEY = `${TEST_USER_IDS.ORGANISATION_ID}:${TEST_USER_IDS.GRANT_ID}`

const importHelperAndDeps = async () => {
  const helper = await import('~/src/server/common/helpers/status/update-application-status-helper.js')
  updateApplicationStatus = helper.updateApplicationStatus
  const logModule = await import('../logging/log.js')
  log = logModule.log
  LogCodes = logModule.LogCodes
}

describe('updateApplicationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParseSessionKey.mockReturnValue({ sbi: TEST_USER_IDS.ORGANISATION_ID, grantCode: TEST_USER_IDS.GRANT_ID })
  })

  describe('With backend configured correctly', () => {
    beforeEach(async () => {
      vi.resetModules()
      vi.doMock('../logging/log.js', () => ({
        log: vi.fn(),
        LogCodes: {
          SYSTEM: {
            EXTERNAL_API_CALL_DEBUG: { level: 'debug', messageFunc: vi.fn() },
            EXTERNAL_API_ERROR: { level: 'error', messageFunc: vi.fn() }
          }
        }
      }))
      vi.doMock('../state/backend-auth-helper.js', () => ({
        createApiHeadersForGrantsUiBackend: mockCreateApiHeaders
      }))
      vi.doMock('../state/get-cache-key-helper.js', () => ({
        parseSessionKey: mockParseSessionKey
      }))
      vi.doMock('~/src/config/config.js', createMockConfig)
      await importHelperAndDeps()
      vi.clearAllMocks()
      mockParseSessionKey.mockReturnValue({ sbi: TEST_USER_IDS.ORGANISATION_ID, grantCode: TEST_USER_IDS.GRANT_ID })
    })

    afterEach(() => {
      vi.unmock('~/src/config/config.js')
    })

    const createSuccessfulFetchResponse = () => ({ ok: true, status: HTTP_STATUS.OK })
    const createFailedFetchResponse = (status = 500, statusText = 'Internal Server Error') => ({
      ok: false,
      status,
      statusText
    })

    it('updates application status successfully when response is ok', async () => {
      fetch.mockResolvedValue(createSuccessfulFetchResponse())

      await updateApplicationStatus(APPLICATION_STATUS, KEY)

      const expectedBody = JSON.stringify({
        state: {
          applicationStatus: APPLICATION_STATUS
        }
      })

      expect(fetch).toHaveBeenCalledTimes(1)
      const [calledUrl, options] = fetch.mock.calls[0]
      expect(calledUrl).toBe(
        new URL(`/state/${TEST_USER_IDS.ORGANISATION_ID}/${TEST_USER_IDS.GRANT_ID}`, TEST_BACKEND_URL).href
      )
      expect(options).toEqual(
        expect.objectContaining({
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token'
          },
          body: expectedBody
        })
      )

      expect(mockCreateApiHeaders).toHaveBeenCalledTimes(1)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
        expect.objectContaining({
          method: 'PATCH',
          endpoint: expect.stringContaining('/state/'),
          identity: KEY,
          summary: {
            applicationStatus: APPLICATION_STATUS
          }
        })
      )

      expect(log).not.toHaveBeenCalledWith(LogCodes.SYSTEM.EXTERNAL_API_ERROR, expect.anything())
    })

    it('logs error when response is not ok', async () => {
      const failedResponse = createFailedFetchResponse()
      fetch.mockResolvedValue(failedResponse)

      await updateApplicationStatus(APPLICATION_STATUS, KEY)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          method: 'PATCH',
          endpoint: expect.stringContaining('/state/'),
          identity: KEY,
          errorMessage: `${failedResponse.status} - ${failedResponse.statusText}`
        })
      )
    })

    it('logs error when fetch throws', async () => {
      const networkError = new Error('Network error')
      fetch.mockRejectedValue(networkError)

      await updateApplicationStatus(APPLICATION_STATUS, KEY)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          method: 'PATCH',
          endpoint: expect.stringContaining('/state/'),
          identity: KEY,
          errorMessage: networkError.message
        })
      )
    })
  })

  describe('With backend not configured', () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      vi.resetModules()
      vi.doMock('../logging/log.js', () => ({
        log: vi.fn(),
        LogCodes: {
          SYSTEM: {
            EXTERNAL_API_CALL_DEBUG: { level: 'debug', messageFunc: vi.fn() },
            EXTERNAL_API_ERROR: { level: 'error', messageFunc: vi.fn() }
          }
        }
      }))
      vi.doMock('../state/backend-auth-helper.js', () => ({
        createApiHeadersForGrantsUiBackend: mockCreateApiHeaders
      }))
      vi.doMock('../state/get-cache-key-helper.js', () => ({
        parseSessionKey: mockParseSessionKey
      }))
      vi.doMock('~/src/config/config.js', createMockConfigWithoutEndpoint)
      await importHelperAndDeps()
      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.unmock('~/src/config/config.js')
    })

    it('should return early when backend endpoint is not configured', async () => {
      const result = await updateApplicationStatus(APPLICATION_STATUS, KEY)

      expect(result).toBeUndefined()
      expect(fetch).not.toHaveBeenCalled()
      expect(log).not.toHaveBeenCalled()
      expect(mockCreateApiHeaders).not.toHaveBeenCalled()
    })
  })
})
