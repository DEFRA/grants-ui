import { config } from '~/src/config/config.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application.service.js'

const gasApi = config.get('gas.apiEndpoint')

describe('submitGrantApplication', () => {
  const code = 'frps-private-beta'
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
