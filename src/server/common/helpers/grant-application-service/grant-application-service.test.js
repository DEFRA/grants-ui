// Now import the modules
import { config } from '~/src/config/config.js'
import { submitLandApplication } from '~/src/server/common/helpers/grant-application-service/grant-application-service.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

jest.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: jest.fn().mockReturnValue({
    error: jest.fn()
  })
}))

const gasApi = config.get('gas.apiEndpoint')
global.fetch = jest.fn()

describe('submitLandApplication', () => {
  const mockParcel = '12345-SX6789'
  const mockActions = 'CSAM1'
  const mockArea = 150
  const mockLogger = createLogger()

  const mockSuccessResponse = {
    applicationId: 'APP-12345',
    status: 'SUBMITTED',
    submissionDate: '2023-05-15T10:30:00Z',
    parcel: mockParcel,
    actions: [mockActions],
    area: mockArea
  }

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch.mockReset()
  })

  it('should submit land application successfully', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    const result = await submitLandApplication(
      mockParcel,
      mockActions,
      mockArea
    )

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/actions/submit-land-application/invoke`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parcel: mockParcel,
          actions: [mockActions],
          area: mockArea
        })
      }
    )
    expect(result).toEqual(mockSuccessResponse)
  })

  it('should throw an error when fetch response is not ok', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request'
    })

    await expect(
      submitLandApplication(mockParcel, mockActions, mockArea)
    ).rejects.toThrow('Bad Request')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('should handle network errors during fetch', async () => {
    // Setup network error
    const networkError = new Error('Network error')
    global.fetch.mockRejectedValueOnce(networkError)

    // Assert that the function throws with the same error
    await expect(
      submitLandApplication(mockParcel, mockActions, mockArea)
    ).rejects.toThrow('Network error')

    // Verify mocks
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('should properly format the request body with different parameters', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    const customParcel = '98765-4321'
    const customActions = 'RESTORE_HABITAT'
    const customArea = 275

    await submitLandApplication(customParcel, customActions, customArea)

    expect(global.fetch).toHaveBeenCalledWith(
      `${gasApi}/grants/actions/submit-land-application/invoke`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parcel: customParcel,
          actions: [customActions],
          area: customArea
        })
      }
    )
  })

  it('should correctly handle the actions array in the request body', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    await submitLandApplication(mockParcel, mockActions, mockArea)

    const [[, options]] = global.fetch.mock.calls
    const body = JSON.parse(options.body)

    expect(Array.isArray(body.actions)).toBe(true)
    expect(body.actions).toEqual([mockActions])
  })
})
