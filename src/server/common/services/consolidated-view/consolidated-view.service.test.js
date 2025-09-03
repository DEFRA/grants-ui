import { vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { config } from '~/src/config/config.js'
import { mockFetch } from '~/src/__mocks__'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import {
  fetchBusinessAndCustomerInformation,
  fetchParcelsForSbi
} from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'

vi.mock('~/src/server/common/helpers/entra/token-manager.js', () => ({
  getValidToken: vi.fn()
}))

vi.mock('fs/promises')

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

const mockFetchInstance = mockFetch()

describe('Consolidated View Service', () => {
  const mockSbi = 123456789
  const mockCrn = 'CRN123456'
  const mockToken = 'mock-token-123'

  /**
   * @type {object}
   */
  const mockParcelsResponse = {
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

  const mockBusinessCustomerResponse = {
    data: {
      business: {
        info: {
          name: 'Test Business Ltd',
          email: { address: 'test@business.com' },
          phone: { mobile: '07123456789' },
          address: {
            line1: '123 Test Street',
            city: 'Test City',
            postalCode: 'TC1 2AB'
          }
        }
      },
      customer: {
        info: {
          name: {
            title: 'Mr',
            first: 'John',
            last: 'Doe'
          }
        }
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchInstance.mockReset()
    getValidToken.mockResolvedValue(mockToken)

    config.set('consolidatedView', {
      apiEndpoint: 'https://api.example.com/graphql',
      authEmail: 'test@example.com',
      mockDALEnabled: false
    })
  })

  describe('fetchParcelsForSbi', () => {
    it('should fetch land parcels successfully', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockParcelsResponse)
      })

      const result = await fetchParcelsForSbi(mockSbi)

      expect(mockFetchInstance).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockParcelsResponse.data.business.land.parcels)

      const [[, calledOptions]] = mockFetchInstance.mock.calls
      expect(calledOptions.headers.Authorization).toBe(`Bearer ${mockToken}`)
      expect(calledOptions.headers.email).toBe('test@example.com')
    })

    it('should return empty array when parcels data is missing', async () => {
      const emptyResponse = { data: { business: { land: {} } } }
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emptyResponse)
      })

      const result = await fetchParcelsForSbi(mockSbi)

      expect(result).toEqual([])
    })
  })

  describe('fetchBusinessAndCustomerInformation', () => {
    it('should fetch business and customer information successfully', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBusinessCustomerResponse)
      })

      const result = await fetchBusinessAndCustomerInformation(mockSbi, mockCrn)

      expect(mockFetchInstance).toHaveBeenCalledTimes(1)
      expect(result).toEqual({
        business: mockBusinessCustomerResponse.data.business.info,
        customer: mockBusinessCustomerResponse.data.customer.info
      })

      const [[, calledOptions]] = mockFetchInstance.mock.calls
      const body = JSON.parse(calledOptions.body)
      expect(body.query).toContain(`business(sbi: "${mockSbi}")`)
      expect(body.query).toContain(`customer(crn: "${mockCrn}")`)
    })

    it('should handle missing business or customer data gracefully', async () => {
      const partialResponse = {
        data: {
          business: { info: null },
          customer: { info: null }
        }
      }
      mockFetchInstance.mockResolvedValueOnce({
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
      mockFetchInstance.mockResolvedValueOnce({
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
      expect(mockFetchInstance).not.toHaveBeenCalled()
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
      expect(mockFetchInstance).not.toHaveBeenCalled()
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
      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied')
      })

      await expect(fetchParcelsForSbi(mockSbi)).rejects.toThrow('Failed to fetch business data: 403 Forbidden')
    })

    it('should wrap non-API errors in ConsolidatedViewApiError', async () => {
      mockFetchInstance.mockImplementation(() => {
        throw new Error('Cannot read property of undefined')
      })

      await expect(fetchParcelsForSbi(mockSbi)).rejects.toThrow('Cannot read property of undefined')
    })
  })
})
