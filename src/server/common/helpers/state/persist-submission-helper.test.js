import { vi } from 'vitest'
import {
  createMockConfig,
  createMockConfigWithoutEndpoint,
  HTTP_STATUS,
  TEST_BACKEND_URL
} from './test-helpers/auth-test-helpers.js'

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
vi.doMock('./backend-auth-helper.js', () => ({
  createApiHeadersForGrantsUiBackend: mockCreateApiHeaders
}))

let persistSubmissionToApi
let log
let LogCodes

const TEST_SUBMISSION = {
  referenceNumber: 'REF123',
  applicantName: 'Jane Doe',
  amount: 1000
}

const importHelperAndDeps = async () => {
  const helper = await import('~/src/server/common/helpers/state/persist-submission-helper.js')
  persistSubmissionToApi = helper.persistSubmissionToApi
  const logModule = await import('../logging/log.js')
  log = logModule.log
  LogCodes = logModule.LogCodes
}

describe('persistSubmissionToApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      vi.doMock('./backend-auth-helper.js', () => ({
        createApiHeadersForGrantsUiBackend: mockCreateApiHeaders
      }))
      vi.doMock('~/src/config/config.js', createMockConfig)
      await importHelperAndDeps()
      vi.clearAllMocks()
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

    it('persists submission successfully when response is ok', async () => {
      fetch.mockResolvedValue(createSuccessfulFetchResponse())

      await persistSubmissionToApi(TEST_SUBMISSION)

      const expectedBody = JSON.stringify({
        ...TEST_SUBMISSION,
        grantVersion: 1
      })

      expect(fetch).toHaveBeenCalledTimes(1)
      const [calledUrl, options] = fetch.mock.calls[0]
      expect(calledUrl).toBe(new URL('/submissions', TEST_BACKEND_URL).href)
      expect(options).toEqual(
        expect.objectContaining({
          method: 'POST',
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
          method: 'POST',
          endpoint: expect.stringContaining('/submissions'),
          summary: {
            hasReference: true,
            keyCount: Object.keys(TEST_SUBMISSION).length
          }
        })
      )

      expect(log).not.toHaveBeenCalledWith(LogCodes.SYSTEM.EXTERNAL_API_ERROR, expect.anything())
    })

    it('logs error when response is not ok', async () => {
      const failedResponse = createFailedFetchResponse()
      fetch.mockResolvedValue(failedResponse)

      await persistSubmissionToApi(TEST_SUBMISSION)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          method: 'POST',
          endpoint: expect.stringContaining('/submissions'),
          referenceNumber: TEST_SUBMISSION.referenceNumber,
          error: `${failedResponse.status} - ${failedResponse.statusText}`
        })
      )
    })

    it('logs error when fetch throws', async () => {
      const networkError = new Error('Network error')
      fetch.mockRejectedValue(networkError)

      await persistSubmissionToApi(TEST_SUBMISSION)

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        expect.objectContaining({
          method: 'POST',
          endpoint: expect.stringContaining('/submissions'),
          referenceNumber: TEST_SUBMISSION.referenceNumber,
          error: networkError.message
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
      vi.doMock('./backend-auth-helper.js', () => ({
        createApiHeadersForGrantsUiBackend: mockCreateApiHeaders
      }))
      vi.doMock('~/src/config/config.js', createMockConfigWithoutEndpoint)
      await importHelperAndDeps()
      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.unmock('~/src/config/config.js')
    })

    it('should return early when backend endpoint is not configured', async () => {
      const result = await persistSubmissionToApi(TEST_SUBMISSION)

      expect(result).toBeUndefined()
      expect(fetch).not.toHaveBeenCalled()
      expect(log).not.toHaveBeenCalled()
      expect(mockCreateApiHeaders).not.toHaveBeenCalled()
    })
  })
})
