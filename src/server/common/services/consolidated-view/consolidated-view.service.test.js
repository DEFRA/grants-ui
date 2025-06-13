import fs from 'fs/promises'
import path from 'path'
import { config } from '~/src/config/config.js'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import { fetchParcelsForSbi } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'

jest.mock('~/src/server/common/helpers/entra/token-manager.js', () => ({
  getValidToken: jest.fn()
}))

jest.mock('fs/promises')

const getMockFilePath = (sbi) => {
  return path.join(
    process.cwd(),
    'src',
    'server',
    'common',
    'services',
    'consolidated-view',
    'land-data',
    `${sbi}.json`
  )
}
/**
 * @type {jest.Mock}
 */
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetchParcelsForSbi', () => {
  const mockSbi = 123456789
  const mockToken = 'mock-token-123'

  /**
   * @type {object}
   */
  const mockSuccessResponse = {
    data: {
      business: {
        land: {
          parcels: [
            {
              parcelId: '0155',
              sheetId: 'SD7946',
              area: 4.0383
            },
            {
              parcelId: '4509',
              sheetId: 'SD7846',
              area: 0.0633
            }
          ]
        }
      }
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
    getValidToken.mockResolvedValue(mockToken)

    config.set('consolidatedView', {
      apiEndpoint: 'https://api.example.com/graphql',
      authEmail: 'test@example.com',
      mockDALEnabled: false
    })
  })

  it('should fetch land parcels successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    const result = await fetchParcelsForSbi(mockSbi)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual(mockSuccessResponse.data.business.land.parcels)

    const [[, calledOptions]] = mockFetch.mock.calls
    expect(calledOptions.headers.Authorization).toBe(`Bearer ${mockToken}`)
  })

  it('should throw an error when fetch response is not ok', async () => {
    const errorText = 'Error response from API'
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve(errorText)
    })

    await expect(fetchParcelsForSbi(mockSbi)).rejects.toThrow(
      'Failed to fetch business data: 404 Not Found'
    )
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should include error details in thrown error', async () => {
    const errorText = 'Error response from API'
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: errorText,
      text: () => Promise.resolve(errorText)
    })

    const error = await fetchParcelsForSbi(mockSbi).catch((e) => e)
    expect(error.status).toBe(500)
    expect(error.responseBody).toBe(
      `Failed to fetch business data: 500 ${errorText}`
    )
  })

  it('should handle network errors during fetch', async () => {
    const networkError = new Error('Network error')
    mockFetch.mockRejectedValueOnce(networkError)

    await expect(fetchParcelsForSbi(mockSbi)).rejects.toThrow(
      'Failed to fetch business data: Network error'
    )
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should include correct GraphQL query with SBI', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    })

    await fetchParcelsForSbi(mockSbi)

    const [[, calledOptions]] = mockFetch.mock.calls
    const body = JSON.parse(calledOptions.body)

    expect(calledOptions.method).toBe('POST')
    expect(calledOptions.headers['Content-Type']).toBe('application/json')
    expect(calledOptions.headers.Authorization).toBe(`Bearer ${mockToken}`)
    expect(body.query).toContain(`business(sbi: "${mockSbi}")`)
  })

  describe('when mock is enabled', () => {
    const mockFileData = {
      data: {
        business: {
          sbi: mockSbi,
          organisationId: 'MOCK-ORG123',
          land: {
            parcels: [
              {
                parcelId: 'MOCK-P001',
                sheetId: 'MOCK-S001',
                area: 150.5
              }
            ]
          }
        }
      }
    }

    beforeEach(() => {
      // Enable mock mode
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        authEmail: 'test@example.com',
        mockDALEnabled: true
      })
    })

    it('should read mock data from file instead of calling API', async () => {
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockFileData))

      const result = await fetchParcelsForSbi(mockSbi)

      expect(result).toEqual(mockFileData)
      expect(fs.readFile).toHaveBeenCalledTimes(1)
      expect(fs.readFile).toHaveBeenCalledWith(getMockFilePath(mockSbi), 'utf8')
      expect(mockFetch).not.toHaveBeenCalled()
      expect(getValidToken).not.toHaveBeenCalled()
    })

    it('should handle file not found error', async () => {
      const fileError = new Error('ENOENT: no such file or directory')
      fileError.code = 'ENOENT'
      fs.readFile.mockRejectedValueOnce(fileError)

      await expect(fetchParcelsForSbi(mockSbi)).rejects.toThrow(
        'Failed to fetch business data: ENOENT: no such file or directory'
      )
    })

    it('should handle invalid JSON in mock file', async () => {
      fs.readFile.mockResolvedValueOnce('invalid json content')

      await expect(fetchParcelsForSbi(mockSbi)).rejects.toThrow(
        'Failed to fetch business data:'
      )
    })

    it('should use correct file path for different SBI', async () => {
      const differentSbi = 987654321
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockFileData))

      await fetchParcelsForSbi(differentSbi)

      expect(fs.readFile).toHaveBeenCalledWith(
        getMockFilePath(differentSbi),
        'utf8'
      )
    })
  })
})
