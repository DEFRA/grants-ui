import fs from 'fs/promises'
import path from 'path'
import { config } from '~/src/config/config.js'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import {
  fetchBusinessAndCustomerInformation,
  fetchParcelsForSbi
} from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'

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

describe('Consolidated View Service', () => {
  const mockSbi = 123456789
  const mockCrn = 'CRN123456'
  const mockToken = 'mock-token-123'

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

  describe('fetchParcelsForSbi', () => {
    it('should return empty array when parcels data is missing', async () => {
      const emptyResponse = { data: { business: { land: {} } } }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emptyResponse)
      })

      const result = await fetchParcelsForSbi(mockSbi)

      expect(result).toEqual([])
    })
  })

  describe('fetchBusinessAndCustomerInformation', () => {
    it('should handle missing business or customer data gracefully', async () => {
      const partialResponse = {
        data: {
          business: { info: null },
          customer: { info: null }
        }
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(partialResponse)
      })

      const result = await fetchBusinessAndCustomerInformation(mockSbi, mockCrn)

      expect(result).toEqual({
        business: null,
        customer: null
      })
    })

    it('should throw error when API call fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      })

      await expect(fetchBusinessAndCustomerInformation(mockSbi, mockCrn)).rejects.toThrow(
        'Failed to fetch business data: 500 Internal Server Error'
      )
    })
  })

  describe('Mock mode functionality', () => {
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
          },
          info: {
            name: 'Mock Business',
            email: { address: 'mock@business.com' }
          }
        },
        customer: {
          info: {
            name: {
              title: 'Mrs',
              first: 'Jane',
              last: 'Smith'
            }
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

    it('should read mock data from file for parcels', async () => {
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockFileData))

      const result = await fetchParcelsForSbi(mockSbi)

      expect(result).toEqual(mockFileData.data.business.land.parcels)
      expect(fs.readFile).toHaveBeenCalledTimes(1)
      expect(fs.readFile).toHaveBeenCalledWith(getMockFilePath(mockSbi), 'utf8')
      expect(mockFetch).not.toHaveBeenCalled()
      expect(getValidToken).not.toHaveBeenCalled()
    })

    it('should read mock data from file for business and customer info', async () => {
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockFileData))

      const result = await fetchBusinessAndCustomerInformation(mockSbi, mockCrn)

      expect(result).toEqual({
        business: mockFileData.data.business.info,
        customer: mockFileData.data.customer.info
      })
      expect(fs.readFile).toHaveBeenCalledTimes(1)
      expect(mockFetch).not.toHaveBeenCalled()
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

      await expect(fetchParcelsForSbi(mockSbi)).rejects.toThrow('Failed to fetch business data:')
    })

    it('should use correct file path for different SBI', async () => {
      const differentSbi = 987654321
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockFileData))

      await fetchParcelsForSbi(differentSbi)

      expect(fs.readFile).toHaveBeenCalledWith(getMockFilePath(differentSbi), 'utf8')
    })
  })

  describe('Error handling', () => {
    it('should preserve ConsolidatedViewApiError properties', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied')
      })

      await expect(fetchParcelsForSbi(mockSbi)).rejects.toThrow('Failed to fetch business data: 403 Forbidden')
    })

    it('should wrap non-API errors in ConsolidatedViewApiError', async () => {
      mockFetch.mockImplementation(() => {
        throw new Error('Cannot read property of undefined')
      })

      await expect(fetchParcelsForSbi(mockSbi)).rejects.toThrow('Cannot read property of undefined')
    })
  })
})
