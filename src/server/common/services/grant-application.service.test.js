import { config } from '~/src/config/config.js'
import {
  invokeGasGetAction,
  invokeGasPostAction,
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
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    })

    const result = await submitGrantApplication({
      grantCode: code,
      payload
    })

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
    expect(result).toEqual(mockResponse)
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
      submitGrantApplication({
        grantCode: code,
        payload
      })
    ).rejects.toThrow(mockMessage)

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

    await expect(
      submitGrantApplication({
        grantCode: code,
        payload
      })
    ).rejects.toThrow('Network error')

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
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    })

    const result = await invokeGasPostAction({
      grantCode: code,
      actionName,
      payload
    })

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
      invokeGasPostAction({
        grantCode: code,
        actionName,
        payload
      })
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
      invokeGasPostAction({
        grantCode: code,
        actionName,
        payload
      })
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
      await invokeGasPostAction({
        grantCode: code,
        actionName,
        payload
      })
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeDefined()
    expect(thrownError.name).toBe('GrantApplicationServiceApiError')
    expect(thrownError.status).toBe(errorStatus)
    expect(thrownError.responseBody).toBe(errorText)
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
  const actionName = 'getStatus'
  const queryString = 'applicationId=12345&includeHistory=true'
  const mockResponse = {
    status: 'approved',
    applicationId: '12345',
    lastUpdated: '2025-04-22T14:30:00Z',
    history: [
      { status: 'submitted', timestamp: '2025-04-22T12:00:00Z' },
      { status: 'under-review', timestamp: '2025-04-22T13:15:00Z' },
      { status: 'approved', timestamp: '2025-04-22T14:30:00Z' }
    ]
  }

  beforeEach(() => {
    jest.resetAllMocks()
  })

  test('should successfully invoke a GET action without query string', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    })

    const result = await invokeGasGetAction({
      grantCode: code,
      actionName
    })

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        body: null
      }
    )
    expect(result).toEqual(mockResponse)
  })

  test('should successfully invoke a GET action with query string', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    })

    const result = await invokeGasGetAction({
      grantCode: code,
      actionName,
      queryString
    })

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke?${queryString}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        body: null
      }
    )
    expect(result).toEqual(mockResponse)
  })

  test('should throw an error when the request fails', async () => {
    const mockMessage = 'Not Found'

    fetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: jest.fn().mockResolvedValueOnce(mockMessage),
      statusText: 'Not Found',
      json: jest.fn().mockResolvedValueOnce({ message: mockMessage })
    })

    await expect(
      invokeGasGetAction({
        grantCode: code,
        actionName,
        queryString
      })
    ).rejects.toThrow(mockMessage)

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke?${queryString}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        body: null
      }
    )
  })

  test('should handle network errors', async () => {
    const networkError = new Error('Network error')
    fetch.mockRejectedValueOnce(networkError)

    await expect(
      invokeGasGetAction({
        grantCode: code,
        actionName,
        queryString
      })
    ).rejects.toThrow('Network error')

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke?${queryString}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        body: null
      }
    )
  })
})

describe('getGrantUrl and getActionUrl', () => {
  test('getGrantUrl should form the correct URL', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({})
    })

    await submitGrantApplication({
      grantCode: code,
      payload: {}
    })

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/applications`,
      expect.any(Object)
    )
  })

  test('getActionUrl should form the correct URL', async () => {
    const actionName = 'testAction'

    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({})
    })

    await invokeGasPostAction({
      grantCode: code,
      actionName,
      payload: {}
    })

    expect(fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/${code}/actions/${actionName}/invoke`,
      expect.any(Object)
    )
  })
})

describe('makeGasApiRequest error handling', () => {
  test('should handle and transform error responses with detailed information', async () => {
    const errorStatus = 500
    const errorBody = JSON.stringify({
      error: 'Internal Server Error',
      details: 'Database connection failed'
    })

    fetch.mockResolvedValue({
      ok: false,
      status: errorStatus,
      text: jest.fn().mockResolvedValueOnce(errorBody),
      statusText: 'Internal Server Error'
    })

    let thrownError
    try {
      await invokeGasPostAction({
        grantCode: code,
        actionName: 'process',
        payload: {}
      })
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeDefined()
    expect(thrownError.name).toBe('GrantApplicationServiceApiError')
    expect(thrownError.status).toBe(errorStatus)
    expect(thrownError.responseBody).toBe(errorBody)
    expect(thrownError.grantCode).toBe(code)
    expect(thrownError.message).toContain('500')
    expect(thrownError.message).toContain('Internal Server Error')
  })

  test('should propagate errors with status and response body', async () => {
    const originalError = new Error('Original error')
    originalError.status = 503
    originalError.responseBody = 'Service Unavailable'

    fetch.mockRejectedValueOnce(originalError)

    let thrownError
    try {
      await invokeGasGetAction({
        grantCode: code,
        actionName: 'status'
      })
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeDefined()
    expect(thrownError.name).toBe('GrantApplicationServiceApiError')
    expect(thrownError.status).toBe(503)
    expect(thrownError.message).toContain('Failed to process GAS API request')
    expect(thrownError.message).toContain('Original error')
  })
})
