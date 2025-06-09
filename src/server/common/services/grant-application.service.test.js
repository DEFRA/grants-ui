import { config } from '~/src/config/config.js'
import {
  invokeGasGetAction,
  invokeGasPostAction,
  makeGasApiRequest,
  submitGrantApplication
} from '~/src/server/common/services/grant-application.service.js'

const gasApi = config.get('gas.apiEndpoint')
const code = config.get('landGrants.grantCode')

describe('submitGrantApplication', () => {
  const payload = {
    metadata: {
      clientRef: 'abc123',
      submittedAt: '2025-04-22T12:00:00Z',
      sbi: '1234567890',
      frn: '1234567890',
      crn: '1234567890',
      defraId: '1234567890'
    },
    answers: {
      scheme: 'SFI',
      year: 2025,
      hasCheckedLandIsUpToDate: true,
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
    jest.resetAllMocks()
  })

  test('should successfully submit a grant application', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const result = await submitGrantApplication(code, payload)

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/applications`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
    expect(result).toEqual(mockRawResponse)
  })

  test('should throw an error when the request fails', async () => {
    const mockMessage = 'Bad Request'

    fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValueOnce(mockMessage),
      statusText: 'Bad Request',
      json: jest.fn().mockResolvedValueOnce({ message: mockMessage })
    })

    await expect(submitGrantApplication(code, payload)).rejects.toThrow(
      mockMessage
    )

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/applications`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
  })

  test('should handle network errors', async () => {
    const networkError = new Error('Network error')
    fetch.mockRejectedValueOnce(networkError)

    await expect(submitGrantApplication(code, payload)).rejects.toThrow(
      'Network error'
    )

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/applications`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
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
    jest.resetAllMocks()
  })

  test('should successfully invoke a POST action', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const result = await invokeGasPostAction(code, actionName, payload)

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
    expect(result).toEqual(mockResponse)
    expect(mockRawResponse.json).toHaveBeenCalled()
  })

  test('should throw an error when the request fails', async () => {
    const mockMessage = 'Bad Request'

    fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValueOnce(mockMessage),
      statusText: 'Bad Request',
      json: jest.fn().mockResolvedValueOnce({ message: mockMessage })
    })

    await expect(
      invokeGasPostAction(code, actionName, payload)
    ).rejects.toThrow(mockMessage)

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
  })

  test('should handle network errors', async () => {
    const networkError = new Error('Network error')
    fetch.mockRejectedValueOnce(networkError)

    await expect(
      invokeGasPostAction(code, actionName, payload)
    ).rejects.toThrow('Network error')

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
  })

  test('should throw a GrantApplicationServiceApiError with correct properties', async () => {
    const errorStatus = 422
    const errorText = JSON.stringify({ message: 'API error' })

    fetch.mockResolvedValue({
      ok: false,
      status: errorStatus,
      text: jest.fn().mockResolvedValueOnce(errorText),
      statusText: 'API error'
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
    expect(thrownError.responseBody).toBe('422 API error')
    expect(thrownError.grantCode).toBe(code)

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
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

  beforeEach(() => {
    jest.resetAllMocks()
  })

  test('should successfully invoke a GET action without query params', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const result = await invokeGasGetAction(code, actionName)

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke`,
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

  test('should successfully invoke a GET action with query params', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const queryParams = { parcelId: '9238', includeHistory: 'true' }
    const result = await invokeGasGetAction(code, actionName, queryParams)

    expect(fetch).toHaveBeenCalledWith(
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
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const result = await invokeGasGetAction(code, actionName, {})

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke`,
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

  test('should throw an error when the request fails', async () => {
    const mockMessage = 'Forbidden'

    fetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValueOnce(mockMessage),
      statusText: 'Forbidden'
    })

    await expect(invokeGasGetAction(code, actionName)).rejects.toThrow(
      mockMessage
    )
  })

  test('should handle network errors', async () => {
    const networkError = new Error('Network error')
    fetch.mockRejectedValueOnce(networkError)

    await expect(invokeGasGetAction(code, actionName)).rejects.toThrow(
      'Network error'
    )
  })

  test('should throw a GrantApplicationServiceApiError with correct properties', async () => {
    const errorStatus = 422
    const errorText = JSON.stringify({ message: 'API error' })

    fetch.mockResolvedValue({
      ok: false,
      status: errorStatus,
      text: jest.fn().mockResolvedValueOnce(errorText),
      statusText: 'API error'
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
    expect(thrownError.message).toBe(
      'Failed to process GAS API request: 422 API error'
    )
  })
})

describe('makeGasApiRequest', () => {
  const testUrl = `${gasApi}/test/endpoint`
  const testGrantCode = 'TEST_GRANT'

  beforeEach(() => {
    jest.resetAllMocks()
  })

  test('should use default options when none provided', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ success: true })
    }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const result = await makeGasApiRequest(testUrl, testGrantCode)

    expect(fetch).toHaveBeenCalledWith(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(undefined)
    })
    expect(result).toEqual(mockRawResponse)
  })

  test('should use default method when only payload provided', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ success: true })
    }
    const payload = { test: 'data' }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const result = await makeGasApiRequest(testUrl, testGrantCode, { payload })

    expect(fetch).toHaveBeenCalledWith(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    expect(result).toEqual(mockRawResponse)
  })

  test('should handle GET request with query params', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ success: true })
    }
    const queryParams = { param1: 'value1', param2: 'value2' }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const result = await makeGasApiRequest(testUrl, testGrantCode, {
      method: 'GET',
      queryParams
    })

    expect(fetch).toHaveBeenCalledWith(
      `${testUrl}?param1=value1&param2=value2`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    expect(result).toEqual(mockRawResponse)
  })

  test('should handle GET request without query params', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ success: true })
    }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const result = await makeGasApiRequest(testUrl, testGrantCode, {
      method: 'GET'
    })

    expect(fetch).toHaveBeenCalledWith(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    expect(result).toEqual(mockRawResponse)
  })

  test('should filter out null and undefined query params', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ success: true })
    }
    const queryParams = {
      valid: 'value',
      nullValue: null,
      undefinedValue: undefined,
      emptyString: '',
      zero: 0
    }

    fetch.mockResolvedValueOnce(mockRawResponse)

    await makeGasApiRequest(testUrl, testGrantCode, {
      method: 'GET',
      queryParams
    })

    expect(fetch).toHaveBeenCalledWith(
      `${testUrl}?valid=value&emptyString=&zero=0`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  })

  test('should throw GrantApplicationServiceApiError on API error', async () => {
    const errorStatus = 400
    const errorText = '400 Bad Request'
    const statusText = 'Bad Request'

    fetch.mockResolvedValueOnce({
      ok: false,
      status: errorStatus,
      statusText,
      text: jest.fn().mockResolvedValueOnce(errorText)
    })

    let thrownError
    try {
      await makeGasApiRequest(testUrl, testGrantCode)
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeDefined()
    expect(thrownError.name).toBe('GrantApplicationServiceApiError')
    expect(thrownError.message).toBe(
      `Failed to process GAS API request: ${errorStatus} ${statusText}`
    )
    expect(thrownError.status).toBe(errorStatus)
    expect(thrownError.responseBody).toBe(errorText)
    expect(thrownError.grantCode).toBe(testGrantCode)
  })

  test('should re-throw GrantApplicationServiceApiError without wrapping', async () => {
    const errorStatus = 500
    const errorText = '500 Internal Server Error'
    const statusText = 'Internal Server Error'

    fetch.mockResolvedValueOnce({
      ok: false,
      status: errorStatus,
      statusText,
      text: jest.fn().mockResolvedValueOnce(errorText)
    })

    await expect(
      makeGasApiRequest(testUrl, testGrantCode)
    ).rejects.toMatchObject({
      name: 'GrantApplicationServiceApiError',
      status: errorStatus,
      responseBody: errorText,
      grantCode: testGrantCode
    })
  })

  test('should wrap network errors in GrantApplicationServiceApiError', async () => {
    const networkError = new Error('Network connection failed')
    fetch.mockRejectedValueOnce(networkError)

    let thrownError
    try {
      await makeGasApiRequest(testUrl, testGrantCode)
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeDefined()
    expect(thrownError.name).toBe('GrantApplicationServiceApiError')
    expect(thrownError.message).toBe(
      'Failed to process GAS API request: Network connection failed'
    )
    expect(thrownError.grantCode).toBe(testGrantCode)
  })
})

describe('makeGasApiRequest edge cases', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  test('should handle GrantApplicationServiceApiError being re-thrown', async () => {
    const mockMessage = 'Server Error'

    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValueOnce(mockMessage),
      statusText: 'Internal Server Error'
    })

    await expect(submitGrantApplication(code, {})).rejects.toThrow(mockMessage)
  })

  test('should handle empty query params object for GET requests', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ success: true })
    }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const result = await invokeGasGetAction(code, 'test', {})

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/test/invoke`,
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

  test('should handle query params with falsy but valid values', async () => {
    const mockRawResponse = {
      ok: true,
      json: jest.fn().mockResolvedValueOnce({ success: true })
    }

    fetch.mockResolvedValueOnce(mockRawResponse)

    const queryParams = { page: 0, search: '', active: 'false' }
    const result = await invokeGasGetAction(code, 'test', queryParams)

    expect(fetch).toHaveBeenCalledWith(
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
