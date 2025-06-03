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
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    })

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
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    })

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
  })

  test('should successfully invoke a GET action with query params', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    })

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
  })

  test('should handle empty query params object', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockResponse)
    })

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
})
