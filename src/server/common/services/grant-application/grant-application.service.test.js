import { vi } from 'vitest'
import { mockSimpleRequest, mockFetch, mockFetchWithResponse } from '~/src/__mocks__/hapi-mocks.js'
import { config } from '~/src/config/config.js'
import {
  invokeGasGetAction,
  invokeGasPostAction,
  makeGasApiRequest,
  submitGrantApplication
} from '~/src/server/common/services/grant-application/grant-application.service.js'

const gasApi = config.get('gas.apiEndpoint')
const code = config.get('landGrants.grantCode')

describe('submitGrantApplication', () => {
  let mockRequest
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

  beforeEach(() => {
    mockRequest = mockSimpleRequest()
  })
  afterEach(() => {
    vi.resetAllMocks()
  })

  test('should successfully submit a grant application', async () => {
    const mockFetchInstance = mockFetchWithResponse(mockResponse)

    const result = await submitGrantApplication(code, payload)

    expect(mockFetchInstance).toHaveBeenCalledWith(`${gasApi}/grants/${code}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
  })

  test('should handle network errors', async () => {
    const mockedFetch = mockFetch()
    const networkError = new Error('Network error')
    mockedFetch.mockRejectedValue(networkError)

    await expect(submitGrantApplication(code, payload)).rejects.toThrow('Network error')

    expect(mockedFetch).toHaveBeenCalledWith(`${gasApi}/grants/${code}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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

  beforeEach(() => {
    vi.resetAllMocks()
  })

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
        'Content-Type': 'application/json'
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
        'Content-Type': 'application/json'
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
        'Content-Type': 'application/json'
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
  })
})

describe('invokeGasGetAction', () => {
  let mockRequest
  const actionName = 'status'
  const mockResponse = {
    success: true,
    actionId: 'action-123',
    status: 'active',
    timestamp: '2025-04-22T12:05:00Z'
  }

  beforeEach(() => {
    vi.resetAllMocks()

    mockRequest = mockSimpleRequest()
  })

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
        'Content-Type': 'application/json'
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
          'Content-Type': 'application/json'
        }
      }
    )
    expect(result).toEqual(mockResponse)
    expect(mockRawResponse.json).toHaveBeenCalled()
  })

  test('should handle empty query params object', async () => {
    const mockedFetch = mockFetch()
    const mockRawResponse = {
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockResponse)
    }

    mockedFetch.mockResolvedValueOnce(mockRawResponse)

    const result = await invokeGasGetAction(code, actionName, mockRequest, {})

    expect(mockedFetch).toHaveBeenCalledWith(`${gasApi}/grants/${code}/actions/${actionName}/invoke`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
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

    await expect(invokeGasGetAction(code, actionName)).rejects.toThrow(mockMessage)
  })

  test('should handle network errors', async () => {
    const mockedFetch = mockFetch()
    const networkError = new Error('Network error')
    mockedFetch.mockRejectedValue(networkError)

    await expect(invokeGasGetAction(code, actionName)).rejects.toThrow('Network error')
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
      await invokeGasGetAction(code, actionName)
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
  let mockRequest
  const testUrl = `${gasApi}/test/endpoint`
  const testGrantCode = 'TEST_GRANT'

  beforeEach(() => {
    vi.resetAllMocks()
    mockRequest = mockSimpleRequest()
  })

  test('should use default options when none provided', async () => {
    const mockedFetch = mockFetch()
    const mockRawResponse = {
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ success: true })
    }

    mockedFetch.mockResolvedValueOnce(mockRawResponse)

    const result = await makeGasApiRequest(testUrl, testGrantCode)

    expect(mockedFetch).toHaveBeenCalledWith(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
        'Content-Type': 'application/json'
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
        'Content-Type': 'application/json'
      }
    })
    expect(result).toEqual(mockRawResponse)
  })

  test('should handle GET request without query params', async () => {
    const mockedFetch = mockFetch()
    const mockRawResponse = {
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ success: true })
    }

    mockedFetch.mockResolvedValueOnce(mockRawResponse)

    const result = await makeGasApiRequest(testUrl, testGrantCode, mockRequest, {
      method: 'GET'
    })

    expect(mockedFetch).toHaveBeenCalledWith(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
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
        'Content-Type': 'application/json'
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

  test('should re-throw GrantApplicationServiceApiError without wrapping', async () => {
    const mockedFetch = mockFetch()
    const errorStatus = 500
    const statusText = 'Internal Server Error'

    mockedFetch.mockResolvedValue({
      ok: false,
      status: errorStatus,
      statusText,
      json: () => ({ message: 'Gas error' })
    })

    await expect(makeGasApiRequest(testUrl, testGrantCode, mockRequest)).rejects.toMatchObject({
      name: 'GrantApplicationServiceApiError',
      status: errorStatus,
      responseBody: 'Gas error',
      grantCode: testGrantCode
    })
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

  test('should retry up to maxRetries on transient errors', async () => {
    const mockedFetch = mockFetch()
    const transientErrorResponse = {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: () => ({ message: 'Service is temporarily unavailable' })
    }
    const successResponse = {
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ success: true })
    }

    mockedFetch
      .mockResolvedValueOnce(transientErrorResponse)
      .mockResolvedValueOnce(transientErrorResponse)
      .mockResolvedValueOnce(successResponse)

    const result = await makeGasApiRequest(testUrl, testGrantCode, mockRequest, {
      retryConfig: { maxAttempts: 3, checkFetchResponse: true }
    })

    expect(mockedFetch).toHaveBeenCalledTimes(3)
    expect(result).toEqual(successResponse)
  })
})

describe('makeGasApiRequest edge cases', () => {
  let mockRequest

  beforeEach(() => {
    mockRequest = mockSimpleRequest()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  test('should handle GrantApplicationServiceApiError being re-thrown', async () => {
    const mockedFetch = mockFetch()
    const mockMessage = 'Server Error'

    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => ({ message: mockMessage }),
      statusText: 'Internal Server Error'
    })

    await expect(submitGrantApplication(code, {})).rejects.toThrow(mockMessage)
  })

  test('should handle empty query params object for GET requests', async () => {
    const mockedFetch = mockFetch()
    const mockRawResponse = {
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ success: true })
    }

    mockedFetch.mockResolvedValueOnce(mockRawResponse)

    const result = await invokeGasGetAction(code, 'test', {})

    expect(mockedFetch).toHaveBeenCalledWith(`${gasApi}/grants/${code}/actions/test/invoke`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    expect(result).toEqual({ success: true })
    expect(mockRawResponse.json).toHaveBeenCalled()
  })

  test('should handle query params with falsy but valid values', async () => {
    const mockedFetch = mockFetch()
    const mockRawResponse = {
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ success: true })
    }

    mockedFetch.mockResolvedValueOnce(mockRawResponse)

    const queryParams = { page: 0, search: '', active: 'false' }
    const result = await invokeGasGetAction(code, 'test', mockRequest, queryParams)

    expect(mockedFetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/test/invoke?page=0&search=&active=false`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    expect(result).toEqual({ success: true })
    expect(mockRawResponse.json).toHaveBeenCalled()
  })
})
