import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { mockFetch } from '~/src/__mocks__'
import {
  fetchBusinessAndCustomerInformation,
  fetchParcelsFromDal,
  fetchBusinessAndCPH
} from './consolidated-view.service.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import {
  mockSbi,
  mockCrn,
  mockToken,
  mockDefraIdToken,
  mockRequest,
  mockParcelsResponse,
  mockBusinessCustomerResponse,
  mockStubModeConfig,
  resetConsolidatedViewMocks
} from './consolidated-view.service.test-helpers.js'

vi.mock('~/src/server/common/helpers/retry.js')

vi.mock('~/src/server/common/helpers/entra/token-manager.js', () => ({
  getValidToken: vi.fn()
}))
vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

vi.mock('fs/promises')

const mockFetchInstance = mockFetch()

describe('Consolidated View Service - Parcels and business', () => {
  beforeEach(() => resetConsolidatedViewMocks(mockFetchInstance))

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
      expect(calledOptions.headers['Content-Type']).toBe(`application/json`)
      expect(calledOptions.headers['gateway-type']).toBe(`external`)
      expect(calledOptions.headers['x-forwarded-authorization']).toBe(mockDefraIdToken)
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

      await expect(fetchBusinessAndCPH(mockRequest)).rejects.toThrow() // Will throw when trying to access [0] on undefined
    })

    it('should log CONSOLIDATED_VIEW_API_ERROR at error level on upstream failure', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      })

      await expect(fetchBusinessAndCPH(mockRequest)).rejects.toThrow()

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' }),
        expect.objectContaining({
          sbi: mockSbi,
          errorMessage: expect.stringContaining('500')
        }),
        mockRequest
      )
    })

    it('should use stub endpoint in mock mode', async () => {
      config.set('consolidatedView', mockStubModeConfig)

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            business: {
              info: { reference: 'MOCK-REF123' },
              countyParishHoldings: [{ cphNumber: 'MOCK-CPH67890' }]
            },
            customer: {
              info: { name: { first: 'Jane', last: 'Smith' } }
            }
          }
        })
      })

      await fetchBusinessAndCPH(mockRequest)

      const [url] = mockFetchInstance.mock.calls[0]
      expect(url).toBe('http://stub/graphql')
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
        business: {
          name: 'Test Business Ltd',
          reference: 'REF123',
          address: {
            line1: '123 Test Street',
            city: 'Test City',
            postalCode: 'TC1 2AB'
          },
          landlinePhoneNumber: '01234567890',
          mobilePhoneNumber: '07123456789',
          email: 'test@business.com'
        },
        customer: mockBusinessCustomerResponse.data.customer.info
      })

      const [[, calledOptions]] = mockFetchInstance.mock.calls
      const body = JSON.parse(calledOptions.body)
      expect(body.query).toContain(`business(sbi: "${mockSbi}")`)
      expect(body.query).toContain(`customer(crn: "${mockCrn}")`)
      expect(body.query).toContain('landline')
      expect(body.query).toContain('mobile')
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
        business: {},
        customer: null
      })
    })

    it('should handle missing phone and email fields', async () => {
      const responseWithoutContact = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
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
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithoutContact)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result).toEqual({
        business: {
          name: 'Test Business Ltd',
          reference: 'REF123',
          address: {
            line1: '123 Test Street',
            city: 'Test City',
            postalCode: 'TC1 2AB'
          },
          landlinePhoneNumber: undefined,
          mobilePhoneNumber: undefined,
          email: undefined
        },
        customer: responseWithoutContact.data.customer.info
      })
    })

    it('should throw error when API call fails', async () => {
      mockFetchInstance.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      })

      try {
        await fetchBusinessAndCustomerInformation(mockRequest)
        throw new Error('should have thrown')
      } catch (error) {
        expect(error.message).toBe('Failed to fetch business data: 500 Internal Server Error')
        expect(error.details.status).toBe(500)
        expect(error.details.responseBody).toBe('Server error')
      }
    })
  })

  describe('Mock mode functionality', () => {
    it('should return formatted business and customer info in stub mode', async () => {
      config.set('consolidatedView', mockStubModeConfig)

      const stubResponse = {
        data: {
          business: {
            info: {
              name: 'Mock Business',
              reference: 'MOCK-REF456',
              email: { address: 'mock@business.com' },
              phone: {
                mobile: '07987654321',
                landline: '01987654321'
              },
              address: {
                line1: '456 Mock Street',
                city: 'Mock City',
                postalCode: 'MC1 2DE'
              }
            }
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

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: async () => stubResponse
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result).toEqual({
        business: {
          name: 'Mock Business',
          reference: 'MOCK-REF456',
          address: {
            line1: '456 Mock Street',
            city: 'Mock City',
            postalCode: 'MC1 2DE'
          },
          landlinePhoneNumber: '01987654321',
          mobilePhoneNumber: '07987654321',
          email: 'mock@business.com'
        },
        customer: stubResponse.data.customer.info
      })

      const [url] = mockFetchInstance.mock.calls[0]
      expect(url).toBe('http://stub/graphql')
    })

    it('should throw ConsolidatedViewError when stub returns non-OK response', async () => {
      config.set('consolidatedView', mockStubModeConfig)

      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Stub failure'
      })

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('Stub request failed')
    })

    it('should throw ConsolidatedViewError when stub returns GraphQL errors', async () => {
      config.set('consolidatedView', mockStubModeConfig)

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'GraphQL error occurred' }]
        })
      })

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('GraphQL error occurred')
    })
  })
})
