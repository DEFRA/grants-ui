import { beforeEach, vi } from 'vitest'
import { mockFetch, mockFetchWithResponse, mockSimpleRequest } from '~/src/__mocks__/hapi-mocks.js'
import { config } from '~/src/config/config.js'
import { retry } from '~/src/server/common/helpers/retry.js'

let invokeGasGetAction
let invokeGasPostAction
let makeGasApiRequest
let submitGrantApplication
let getApplicationStatus

vi.mock('~/src/server/common/helpers/retry.js')
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn()
}))

global.fetch = mockFetch

const gasApi = config.get('gas.apiEndpoint')
const code = config.get('landGrants.grantCode')

describe('Grant Application service (token present)', () => {
  let mockRequest
  beforeAll(async () => {
    vi.stubEnv('GAS_API_AUTH_TOKEN', 'mock-auth-token')
    vi.resetModules()
    const mod = await import('~/src/server/common/services/grant-application/grant-application.service.js')
    invokeGasGetAction = mod.invokeGasGetAction
    invokeGasPostAction = mod.invokeGasPostAction
    makeGasApiRequest = mod.makeGasApiRequest
    submitGrantApplication = mod.submitGrantApplication
    const mod2 = await import('./grant-application.service')
    getApplicationStatus = mod2.getApplicationStatus
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequest = mockSimpleRequest()

    retry.mockImplementation((operation, options) => {
      try {
        return operation()
      } catch (error) {
        if (options?.onRetry) {
          options.onRetry(error, 1)
        }
        throw error
      }
    })
  })

  describe('submitGrantApplication', () => {
    const payload = {
      metadata: {
        clientRef: 'abc123',
        submittedAt: '2025-04-22T12:00:00Z',
        sbi: '106284736',
        frn: '1234567890',
        crn: '1234567890',
        defraId: '1234567890'
      },
      answers: {
        scheme: 'SFI',
        actionApplications: [
          {
            parcelId: '9238',
            sheetId: 'SX0679',
            code: 'CSAM1',
            appliedFor: {
              unit: 'ha',
              quantity: 20.23
            }
          }
        ]
      }
    }
    const mockResponse = {
      id: '12345',
      status: 'submitted',
      applicationRef: 'APP-2025-001'
    }

    test('should successfully submit a grant application', async () => {
      const mockFetchInstance = mockFetchWithResponse(mockResponse)

      const result = await submitGrantApplication(code, payload)

      expect(mockFetchInstance).toHaveBeenCalledWith(`${gasApi}/grants/${code}/applications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        },
        body: JSON.stringify(payload)
      })
      expect(result.ok).toBe(true)
    })

    test('should throw an error when the request fails', async () => {
      const mockedFetch = mockFetch()
      const mockMessage = 'Bad Request'

      mockedFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValueOnce({ message: mockMessage })
      })

      await expect(submitGrantApplication(code, payload, mockRequest)).rejects.toThrow(mockMessage)

      expect(fetch).toHaveBeenCalledWith(`${gasApi}/grants/${code}/applications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        },
        body: JSON.stringify(payload)
      })
    })
  })

  describe('invokeGasPostAction', () => {
    const actionName = 'submit'
    const payload = {
      applicationId: '12345',
      metadata: {
        clientRef: 'abc123',
        submittedAt: '2025-04-22T12:00:00Z'
      },
      data: {
        status: 'complete'
      }
    }
    const mockResponse = {
      success: true,
      actionId: 'action-123',
      timestamp: '2025-04-22T12:05:00Z'
    }

    test('should successfully invoke a POST action', async () => {
      const mockedFetch = mockFetch()
      const mockRawResponse = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse)
      }

      mockedFetch.mockResolvedValueOnce(mockRawResponse)

      const result = await invokeGasPostAction(code, actionName, payload)

      expect(mockedFetch).toHaveBeenCalledWith(`${gasApi}/grants/${code}/actions/${actionName}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        },
        body: JSON.stringify(payload)
      })
      expect(result).toEqual(mockResponse)
      expect(mockRawResponse.json).toHaveBeenCalled()
    })

    test('should throw an error when the request fails', async () => {
      const mockedFetch = mockFetch()
      const mockMessage = 'Bad Request'

      mockedFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValueOnce({ message: mockMessage })
      })

      await expect(invokeGasPostAction(code, actionName, payload)).rejects.toThrow(mockMessage)

      expect(mockedFetch).toHaveBeenCalledWith(`${gasApi}/grants/${code}/actions/${actionName}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        },
        body: JSON.stringify(payload)
      })
    })

    test('should handle network errors', async () => {
      const networkError = new Error('Network error')
      const mockedFetch = mockFetch()
      mockedFetch.mockRejectedValue(networkError)

      await expect(invokeGasPostAction(code, actionName, payload)).rejects.toThrow('Network error')

      expect(mockedFetch).toHaveBeenCalledWith(`${gasApi}/grants/${code}/actions/${actionName}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        },
        body: JSON.stringify(payload)
      })
    })

    test('should throw a GrantApplicationServiceApiError with correct properties', async () => {
      const errorStatus = 422
      const mockedFetch = mockFetch()

      mockedFetch.mockResolvedValue({
        ok: false,
        status: errorStatus,
        json: () => ({ message: 'Gas error' }),
        statusText: 'Internal Server Error'
      })

      let thrownError
      try {
        await invokeGasPostAction(code, actionName, payload)
      } catch (error) {
        thrownError = error
      }

      expect(thrownError).toBeDefined()
      expect(thrownError.name).toBe('GrantApplicationServiceApiError')
      expect(thrownError.status).toBe(errorStatus)
      expect(thrownError.responseBody).toBe('Gas error')
      expect(thrownError.grantCode).toBe(code)

      expect(mockedFetch).toHaveBeenCalledWith(`${gasApi}/grants/${code}/actions/${actionName}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        },
        body: JSON.stringify(payload)
      })
    })
  })

  describe('invokeGasGetAction', () => {
    const actionName = 'status'
    const mockResponse = {
      success: true,
      actionId: 'action-123',
      status: 'active',
      timestamp: '2025-04-22T12:05:00Z'
    }

    test('should successfully invoke a GET action without query params', async () => {
      const mockedFetch = mockFetch()
      const mockRawResponse = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse)
      }

      mockedFetch.mockResolvedValueOnce(mockRawResponse)

      const result = await invokeGasGetAction(code, actionName, mockRequest)

      expect(mockedFetch).toHaveBeenCalledWith(`${gasApi}/grants/${code}/actions/${actionName}/invoke`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        }
      })
      expect(result).toEqual(mockResponse)
      expect(mockRawResponse.json).toHaveBeenCalled()
    })

    test('should successfully invoke a GET action with query params', async () => {
      const mockedFetch = mockFetch()
      const mockRawResponse = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse)
      }

      mockedFetch.mockResolvedValueOnce(mockRawResponse)

      const queryParams = { parcelId: '9238', includeHistory: 'true' }
      const result = await invokeGasGetAction(code, actionName, mockRequest, queryParams)

      expect(mockedFetch).toHaveBeenCalledWith(
        `${gasApi}/grants/${code}/actions/${actionName}/invoke?parcelId=9238&includeHistory=true`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-auth-token'
          }
        }
      )
      expect(result).toEqual(mockResponse)
      expect(mockRawResponse.json).toHaveBeenCalled()
    })

    test('should throw an error when the request fails', async () => {
      const mockedFetch = mockFetch()
      const mockMessage = 'Forbidden'

      mockedFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => ({ message: mockMessage }),
        statusText: 'Forbidden'
      })

      await expect(invokeGasGetAction(code, actionName, mockRequest, {})).rejects.toThrow(mockMessage)
    })

    test('should handle network errors', async () => {
      const mockedFetch = mockFetch()
      const networkError = new Error('Network error')
      mockedFetch.mockRejectedValue(networkError)

      await expect(invokeGasGetAction(code, actionName, mockRequest, {})).rejects.toThrow('Network error')
    })

    test('should throw a GrantApplicationServiceApiError with correct properties', async () => {
      const mockedFetch = mockFetch()
      const errorStatus = 422

      mockedFetch.mockResolvedValue({
        ok: false,
        status: errorStatus,
        json: () => ({ message: 'Gas error' }),
        statusText: 'Bad Request'
      })

      let thrownError
      try {
        await invokeGasGetAction(code, actionName, mockRequest)
      } catch (error) {
        thrownError = error
      }

      expect(thrownError).toBeDefined()
      expect(thrownError.name).toBe('GrantApplicationServiceApiError')
      expect(thrownError.status).toBe(errorStatus)
      expect(thrownError.grantCode).toBe(code)
      expect(thrownError.message).toBe('422 Bad Request - Gas error')
    })
  })

  describe('makeGasApiRequest', () => {
    const testUrl = `${gasApi}/test/endpoint`
    const testGrantCode = 'TEST_GRANT'

    test('should use default options when none provided', async () => {
      const mockedFetch = mockFetch()
      const mockRawResponse = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ success: true })
      }

      mockedFetch.mockResolvedValueOnce(mockRawResponse)

      const result = await makeGasApiRequest(testUrl, testGrantCode, mockRequest)

      expect(mockedFetch).toHaveBeenCalledWith(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        },
        body: JSON.stringify(undefined)
      })
      expect(result).toEqual(mockRawResponse)
    })

    test('should use default method when only payload provided', async () => {
      const mockedFetch = mockFetch()
      const mockRawResponse = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ success: true })
      }
      const payload = { test: 'data' }

      mockedFetch.mockResolvedValueOnce(mockRawResponse)

      const result = await makeGasApiRequest(testUrl, testGrantCode, mockRequest, { payload })

      expect(mockedFetch).toHaveBeenCalledWith(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        },
        body: JSON.stringify(payload)
      })
      expect(result).toEqual(mockRawResponse)
    })

    test('should handle GET request with query params', async () => {
      const mockedFetch = mockFetch()
      const mockRawResponse = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ success: true })
      }
      const queryParams = { param1: 'value1', param2: 'value2' }

      mockedFetch.mockResolvedValueOnce(mockRawResponse)

      const result = await makeGasApiRequest(testUrl, testGrantCode, mockRequest, {
        method: 'GET',
        queryParams
      })

      expect(mockedFetch).toHaveBeenCalledWith(`${testUrl}?param1=value1&param2=value2`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        }
      })
      expect(result).toEqual(mockRawResponse)
    })

    test('should filter out null and undefined query params', async () => {
      const mockedFetch = mockFetch()
      const mockRawResponse = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ success: true })
      }
      const queryParams = {
        valid: 'value',
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        zero: 0
      }

      mockedFetch.mockResolvedValueOnce(mockRawResponse)

      await makeGasApiRequest(testUrl, testGrantCode, mockRequest, {
        method: 'GET',
        queryParams
      })

      expect(mockedFetch).toHaveBeenCalledWith(`${testUrl}?valid=value&emptyString=&zero=0`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        }
      })
    })

    test('should throw GrantApplicationServiceApiError on API error', async () => {
      const mockedFetch = mockFetch()
      const errorStatus = 400
      const statusText = 'Bad Request'

      mockedFetch.mockResolvedValue({
        ok: false,
        status: errorStatus,
        statusText,
        json: () => ({ message: 'Gas error' })
      })

      let thrownError
      try {
        await makeGasApiRequest(testUrl, testGrantCode, mockRequest)
      } catch (error) {
        thrownError = error
      }

      expect(thrownError).toBeDefined()
      expect(thrownError.name).toBe('GrantApplicationServiceApiError')
      expect(thrownError.message).toBe(`${errorStatus} ${statusText} - Gas error`)
      expect(thrownError.status).toBe(errorStatus)
      expect(thrownError.responseBody).toBe('Gas error')
      expect(thrownError.grantCode).toBe(testGrantCode)
    })

    test('should wrap network errors in GrantApplicationServiceApiError', async () => {
      const mockedFetch = mockFetch()
      const networkError = new Error('Network connection failed')
      mockedFetch.mockRejectedValue(networkError)

      let thrownError
      try {
        await makeGasApiRequest(testUrl, testGrantCode, mockRequest)
      } catch (error) {
        thrownError = error
      }

      expect(thrownError).toBeDefined()
      expect(thrownError.name).toBe('GrantApplicationServiceApiError')
      expect(thrownError.message).toBe('Failed to process GAS API request: Network connection failed')
      expect(thrownError.grantCode).toBe(testGrantCode)
    })
  })

  describe('getApplicationStatus', () => {
    test('should call grants application endpoint with GET method', async () => {
      const mockedFetch = mockFetch()
      const mockRawResponse = {
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ success: true })
      }

      mockedFetch.mockResolvedValueOnce(mockRawResponse)

      const result = await getApplicationStatus('my-code', 'client-ref')

      expect(mockedFetch).toHaveBeenCalledWith(`${gasApi}/grants/my-code/applications/client-ref/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-auth-token'
        }
      })
      expect(result).toEqual(mockRawResponse)
    })
  })

  describe('authorization header handling (token absent)', () => {
    let localMakeGasApiRequest
    beforeAll(async () => {
      vi.stubEnv('GAS_API_AUTH_TOKEN', '')
      vi.resetModules()
      const mod = await import('~/src/server/common/services/grant-application/grant-application.service.js')
      localMakeGasApiRequest = mod.makeGasApiRequest
    })

    test('should not send Authorization header when GAS_API_AUTH_TOKEN is not set', async () => {
      const mockedFetch = mockFetch()
      const mockRawResponse = { ok: true, json: vi.fn().mockResolvedValueOnce({ ok: true }) }
      mockedFetch.mockResolvedValueOnce(mockRawResponse)

      const testUrl = `${gasApi}/no-auth/endpoint`
      await localMakeGasApiRequest(testUrl, 'TEST_NO_AUTH', mockRequest, { method: 'GET' })

      expect(mockedFetch).toHaveBeenCalledWith(testUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
    })
  })

  describe('timeout handling', () => {
    describe('submitGrantApplication with real fetch timeout', () => {
      const payload = {
        metadata: { clientRef: 'abc123' },
        answers: { scheme: 'SFI' }
      }

      test('should timeout when fetch takes too long', async () => {
        const mockedFetch = mockFetch()

        mockedFetch.mockImplementation(() => new Promise(() => {}))

        retry.mockImplementation(async (operation, options = {}) => {
          const { timeout = 100 } = options

          const timeoutPromise = new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
          )

          return Promise.race([operation(), timeoutPromise])
        })

        let thrownError
        try {
          await submitGrantApplication(code, payload, mockRequest)
        } catch (error) {
          thrownError = error
        }

        expect(thrownError).toBeDefined()
        expect(thrownError.name).toBe('GrantApplicationServiceApiError')
        expect(thrownError.message).toContain('Operation timed out')
        expect(thrownError.grantCode).toBe(code)
      }, 10000)

      test('should handle slow responses with configured timeout', async () => {
        const mockedFetch = mockFetch()

        mockedFetch.mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => ({ success: true }) }), 10000))
        )

        retry.mockImplementation(async (operation, options = {}) => {
          const { timeout = 100 } = options

          const timeoutPromise = new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
          )

          return Promise.race([operation(), timeoutPromise])
        })

        await expect(submitGrantApplication(code, payload, mockRequest)).rejects.toThrow(
          'Failed to process GAS API request: Operation timed out after 100ms'
        )
      })
    })

    describe('invokeGasPostAction with real fetch timeout', () => {
      const actionName = 'submit'
      const payload = { applicationId: '12345' }

      test('should timeout when fetch hangs', async () => {
        const mockedFetch = mockFetch()

        mockedFetch.mockImplementation(() => new Promise(() => {}))

        retry.mockImplementation(async (operation, options = {}) => {
          const { timeout = 100 } = options

          const timeoutPromise = new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
          )

          return Promise.race([operation(), timeoutPromise])
        })

        let thrownError
        try {
          await invokeGasPostAction(code, actionName, payload, mockRequest)
        } catch (error) {
          thrownError = error
        }

        expect(thrownError).toBeDefined()
        expect(thrownError.name).toBe('GrantApplicationServiceApiError')
        expect(thrownError.message).toContain('Failed to process GAS API request')
        expect(thrownError.message).toContain('Operation timed out')
        expect(thrownError.grantCode).toBe(code)
      }, 10000)

      test('should timeout when fetch takes longer than configured timeout', async () => {
        const mockedFetch = mockFetch()

        mockedFetch.mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => ({ success: true }) }), 5000))
        )

        retry.mockImplementation(async (operation, options = {}) => {
          const { timeout = 50 } = options

          const timeoutPromise = new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
          )

          return Promise.race([operation(), timeoutPromise])
        })

        await expect(invokeGasPostAction(code, actionName, payload, mockRequest)).rejects.toThrow(
          'Failed to process GAS API request: Operation timed out after 50ms'
        )
      })
    })

    describe('invokeGasGetAction with real fetch timeout', () => {
      const actionName = 'status'
      const queryParams = { parcelId: '9238' }

      test('should timeout when GET request hangs', async () => {
        const mockedFetch = mockFetch()

        mockedFetch.mockImplementation(() => new Promise(() => {}))

        retry.mockImplementation(async (operation, options = {}) => {
          const { timeout = 100 } = options

          const timeoutPromise = new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
          )

          return Promise.race([operation(), timeoutPromise])
        })

        let thrownError
        try {
          await invokeGasGetAction(code, actionName, mockRequest, queryParams)
        } catch (error) {
          thrownError = error
        }

        expect(thrownError).toBeDefined()
        expect(thrownError.name).toBe('GrantApplicationServiceApiError')
        expect(thrownError.message).toContain('Operation timed out')
        expect(thrownError.grantCode).toBe(code)
      }, 10000)

      test('should timeout when GET request exceeds timeout threshold', async () => {
        const mockedFetch = mockFetch()

        mockedFetch.mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => ({ status: 'active' }) }), 3000))
        )

        retry.mockImplementation(async (operation, options = {}) => {
          const { timeout = 75 } = options

          const timeoutPromise = new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
          )

          return Promise.race([operation(), timeoutPromise])
        })

        await expect(invokeGasGetAction(code, actionName, mockRequest, queryParams)).rejects.toThrow(
          'Failed to process GAS API request: Operation timed out after 75ms'
        )
      })
    })

    describe('makeGasApiRequest with real fetch timeout', () => {
      const testUrl = `${gasApi}/test/endpoint`
      const testGrantCode = 'TEST_GRANT'

      test('should timeout when fetch hangs indefinitely', async () => {
        const mockedFetch = mockFetch()

        mockedFetch.mockImplementation(() => new Promise(() => {}))

        retry.mockImplementation(async (operation, options = {}) => {
          const { timeout = 100 } = options

          const timeoutPromise = new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
          )

          return Promise.race([operation(), timeoutPromise])
        })

        let thrownError
        try {
          await makeGasApiRequest(testUrl, testGrantCode, mockRequest)
        } catch (error) {
          thrownError = error
        }

        expect(thrownError).toBeDefined()
        expect(thrownError.name).toBe('GrantApplicationServiceApiError')
        expect(thrownError.message).toBe('Failed to process GAS API request: Operation timed out after 100ms')
        expect(thrownError.grantCode).toBe(testGrantCode)
      }, 10000)

      test('should preserve timeout error details when configured with custom timeout', async () => {
        const mockedFetch = mockFetch()

        mockedFetch.mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => ({ success: true }) }), 20000))
        )

        retry.mockImplementation(async (operation, options = {}) => {
          const { timeout = 150 } = options

          const timeoutPromise = new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
          )

          return Promise.race([operation(), timeoutPromise])
        })

        let thrownError
        try {
          await makeGasApiRequest(testUrl, testGrantCode, mockRequest, {
            method: 'GET',
            retryConfig: { timeout: 150 }
          })
        } catch (error) {
          thrownError = error
        }

        expect(thrownError).toBeDefined()
        expect(thrownError.name).toBe('GrantApplicationServiceApiError')
        expect(thrownError.message).toContain('Operation timed out after 150ms')
        expect(thrownError.grantCode).toBe(testGrantCode)
      })
    })

    describe('getApplicationStatus with real fetch timeout', () => {
      test('should timeout when status fetch hangs', async () => {
        const mockedFetch = mockFetch()

        mockedFetch.mockImplementation(() => new Promise(() => {}))

        retry.mockImplementation(async (operation, options = {}) => {
          const { timeout = 100 } = options

          const timeoutPromise = new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
          )

          return Promise.race([operation(), timeoutPromise])
        })

        let thrownError
        try {
          await getApplicationStatus('my-code', 'client-ref', mockRequest)
        } catch (error) {
          thrownError = error
        }

        expect(thrownError).toBeDefined()
        expect(thrownError.name).toBe('GrantApplicationServiceApiError')
        expect(thrownError.message).toContain('Operation timed out')
        expect(thrownError.grantCode).toBe('my-code')
      }, 10000)
    })
  })
})
