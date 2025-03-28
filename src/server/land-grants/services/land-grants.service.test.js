import { config } from '~/src/config/config.js'
import { fetchLandSheetDetails } from '~/src/server/land-grants/services/land-grants.service.js'

const landGrantsApi = config.get('landGrants.apiEndpoint')

/**
 * @type {jest.Mock}
 */
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetchBusinessDetails', () => {
  const parcelId = '9238'
  const sheetId = 'SX0679'

  /**
   * @type {object}
   */
  const mockSuccessResponse = {
    data: {
      message: 'success',
      parcel: {
        parcelId: 9238,
        sheetId: 'SX0679',
        size: {
          unit: 'ha',
          value: 477
        },
        actions: [
          {
            code: 'BND1',
            description: 'BND1: Maintain dry stone walls',
            availableArea: {
              unit: 'ha',
              value: 907
            }
          }
        ]
      }
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  it('should fetch land actions successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    const result = await fetchLandSheetDetails(parcelId, sheetId)

    expect(mockFetch).toHaveBeenCalledWith(
      `${landGrantsApi}/parcel/SX0679-9238`,
      { method: 'GET' }
    )

    expect(result).toEqual(mockSuccessResponse)
  })

  it('should throw an error when fetch response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })

    await expect(fetchLandSheetDetails(parcelId, sheetId)).rejects.toThrow()

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should handle network errors during fetch', async () => {
    const networkError = new Error('Network error')
    mockFetch.mockRejectedValueOnce(networkError)

    await expect(fetchLandSheetDetails(parcelId, sheetId)).rejects.toThrow(
      'Network error'
    )

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
