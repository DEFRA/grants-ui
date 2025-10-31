import { vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { config } from '~/src/config/config.js'
import { mockFetch } from '~/src/__mocks__'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import {
  fetchBusinessAndCustomerInformation,
  fetchParcelsFromDal
} from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { fetchBusinessAndCPH } from './consolidated-view.service.js'
import { retry } from '~/src/server/common/helpers/retry.js'

vi.mock('~/src/server/common/helpers/retry.js')

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
  const mockSbi = 106284736
  const mockCrn = 'CRN123456'
  const mockToken = 'mock-token-123'
  const mockDefraIdToken = 'mock-defra-id-token-123'

  const mockRequest = {
    auth: {
      credentials: {
        sbi: mockSbi,
        crn: mockCrn,
        token: mockDefraIdToken
      }
    }
  }

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

    retry.mockImplementation(async (operation, options) => {
      try {
        return await operation()
      } catch (error) {
        if (options?.onRetry) {
          options.onRetry(error, 1)
        }
        throw error
      }
    })

    config.set('defraId', {
      enabled: true
    })
    config.set('consolidatedView', {
      apiEndpoint: 'https://api.example.com/graphql',
      authEmail: 'test@example.com',
      mockDALEnabled: false
    })
  })

  describe('fetchParcelsFromDal', () => {
    it('should fetch land parcels successfully', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockParcelsResponse)
      })

      const result = await fetchParcelsFromDal(mockRequest)

      expect(mockFetchInstance).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockParcelsResponse.data.business.land.parcels)

      const [[, calledOptions]] = mockFetchInstance.mock.calls
      expect(calledOptions.headers.Authorization).toBe(`Bearer ${mockToken}`)
    })

    it('should set external headers for defraID requests', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockParcelsResponse)
      })

      const result = await fetchParcelsFromDal(mockRequest)

      expect(mockFetchInstance).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockParcelsResponse.data.business.land.parcels)

      const [[, calledOptions]] = mockFetchInstance.mock.calls
      expect(calledOptions.headers['gateway-type']).toBe(`external`)
      expect(calledOptions.headers['x-forwarded-authorization']).toBe(mockDefraIdToken)
    })

    it('should set internal headers for non-defraID requests', async () => {
      config.set('defraId', {
        enabled: false
      })
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockParcelsResponse)
      })

      const result = await fetchParcelsFromDal(mockRequest)

      expect(mockFetchInstance).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockParcelsResponse.data.business.land.parcels)

      const [[, calledOptions]] = mockFetchInstance.mock.calls
      expect(calledOptions.headers['email']).toBe('test@example.com')
      expect(calledOptions.headers['gateway-type']).toBeUndefined()
      expect(calledOptions.headers['x-forwarded-authorization']).toBeUndefined()
    })

    it('should return empty array when parcels data is missing', async () => {
      const emptyResponse = { data: { business: { land: {} } } }
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emptyResponse)
      })

      const result = await fetchParcelsFromDal(mockRequest)

      expect(result).toEqual([])
    })
  })

  describe('fetchBusinessAndCPH', () => {
    it('should fetch business and CPH information successfully', async () => {
      const mockCPHResponse = {
        data: {
          business: {
            info: {
              reference: 'REF123',
              email: { address: 'test@business.com' },
              phone: { mobile: '07123456789' },
              name: 'Test Business Ltd',
              address: {
                line1: '123 Test Street',
                line2: 'Suite 1',
                line3: '',
                line4: '',
                line5: '',
                street: 'Test Street',
                city: 'Test City',
                postalCode: 'TC1 2AB'
              },
              vat: 'GB123456789',
              type: {
                code: 'LTD',
                type: 'Limited Company'
              }
            },
            countyParishHoldings: [{ cphNumber: 'CPH12345' }]
          },
          customer: {
            info: {
              name: {
                title: 'Mr',
                first: 'John',
                middle: 'William',
                last: 'Doe'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCPHResponse)
      })

      const result = await fetchBusinessAndCPH(mockRequest)

      expect(mockFetchInstance).toHaveBeenCalledTimes(1)
      expect(result).toEqual({
        business: mockCPHResponse.data.business.info,
        countyParishHoldings: 'CPH12345',
        customer: mockCPHResponse.data.customer.info
      })

      const [[, calledOptions]] = mockFetchInstance.mock.calls
      const body = JSON.parse(calledOptions.body)
      expect(body.query).toContain(`business(sbi: "${mockSbi}")`)
      expect(body.query).toContain(`customer(crn: "${mockCrn}")`)
      expect(body.query).toContain('countyParishHoldings')
      expect(body.query).toContain('vat')
      expect(body.query).toContain('type')
    })

    it('should handle missing countyParishHoldings array', async () => {
      const responseWithoutCPH = {
        data: {
          business: {
            info: {
              name: 'Test Business',
              vat: 'GB123456789'
            }
            // countyParishHoldings is missing
          },
          customer: {
            info: {
              name: {
                first: 'John',
                last: 'Doe'
              }
            }
          }
        }
      }
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithoutCPH)
      })

      await expect(async () => {
        await fetchBusinessAndCPH(mockRequest)
      }).rejects.toThrow() // Will throw when trying to access [0] on undefined
    })

    it('should throw error when API call fails', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      })

      await expect(fetchBusinessAndCPH(mockRequest)).rejects.toThrow(
        'Failed to fetch business data: 500 Internal Server Error'
      )
    })

    it('should work correctly in mock mode', async () => {
      // Enable mock mode
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        authEmail: 'test@example.com',
        mockDALEnabled: true
      })

      const mockFileData = {
        data: {
          business: {
            info: {
              reference: 'MOCK-REF123',
              name: 'Mock Business Ltd',
              email: { address: 'mock@business.com' },
              phone: { mobile: '07987654321' },
              address: {
                line1: '456 Mock Street',
                city: 'Mock City',
                postalCode: 'MC1 2DE'
              },
              vat: 'GB987654321',
              type: {
                code: 'LLP',
                type: 'Limited Liability Partnership'
              }
            },
            countyParishHoldings: [{ cphNumber: 'MOCK-CPH67890' }]
          },
          customer: {
            info: {
              name: {
                title: 'Mrs',
                first: 'Jane',
                middle: 'Mary',
                last: 'Smith'
              }
            }
          }
        }
      }

      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockFileData))

      const result = await fetchBusinessAndCPH(mockRequest)

      expect(result).toEqual({
        business: mockFileData.data.business.info,
        countyParishHoldings: 'MOCK-CPH67890',
        customer: mockFileData.data.customer.info
      })
      expect(fs.readFile).toHaveBeenCalledTimes(1)
      expect(mockFetchInstance).not.toHaveBeenCalled()
    })

    it('should extract CPH number from first element in array', async () => {
      const responseWithMultipleCPH = {
        data: {
          business: {
            info: { name: 'Test Business' },
            countyParishHoldings: [{ cphNumber: 'CPH-FIRST' }, { cphNumber: 'CPH-SECOND' }]
          },
          customer: {
            info: {
              name: { first: 'John', last: 'Doe' }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithMultipleCPH)
      })

      const result = await fetchBusinessAndCPH(mockRequest)

      expect(result.countyParishHoldings).toBe('CPH-FIRST')
    })
  })

  describe('fetchBusinessAndCustomerInformation', () => {
    it('should fetch business and customer information successfully', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBusinessCustomerResponse)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

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

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

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

      await expect(fetchBusinessAndCustomerInformation(mockRequest)).rejects.toThrow(
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

      const result = await fetchParcelsFromDal(mockRequest)

      expect(result).toEqual(mockFileData.data.business.land.parcels)
      expect(fs.readFile).toHaveBeenCalledTimes(1)
      expect(fs.readFile).toHaveBeenCalledWith(getMockFilePath(mockSbi), 'utf8')
      expect(mockFetchInstance).not.toHaveBeenCalled()
      expect(getValidToken).not.toHaveBeenCalled()
    })

    it('should read mock data from file for business and customer info', async () => {
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockFileData))

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

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

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow(
        'Failed to fetch business data: ENOENT: no such file or directory'
      )
    })

    it('should handle invalid JSON in mock file', async () => {
      fs.readFile.mockResolvedValueOnce('invalid json content')

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('Failed to fetch business data:')
    })

    it('should use correct file path for different SBI', async () => {
      const differentSbi = 987654321
      const differentMockRequest = {
        auth: {
          credentials: {
            ...mockRequest.auth.credentials,
            sbi: differentSbi
          }
        }
      }
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockFileData))

      await fetchParcelsFromDal(differentMockRequest)

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

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('Failed to fetch business data: 403 Forbidden')
    })

    it('should wrap non-API errors in ConsolidatedViewApiError', async () => {
      mockFetchInstance.mockImplementation(() => {
        throw new Error('Cannot read property of undefined')
      })

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('Cannot read property of undefined')
    })
  })
})
