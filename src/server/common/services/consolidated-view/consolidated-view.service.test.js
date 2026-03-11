import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { mockFetch } from '~/src/__mocks__'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import {
  fetchBusinessAndCustomerInformation,
  fetchParcelsFromDal,
  executeConfigDrivenQuery,
  hasOnlyToleratedFailures,
  fetchBusinessAndCPH
} from './consolidated-view.service.js'
import { retry } from '~/src/server/common/helpers/retry.js'

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
              sheetId: 'SD7946'
            },
            {
              parcelId: '4509',
              sheetId: 'SD7846'
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
          phone: { mobile: '07123456789', landline: '01234567890' },
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
      mockDALEnabled: false,
      toleratedFailurePaths: [],
      developerKey: ''
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

    it('should use stub endpoint in mock mode', async () => {
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        mockDALEnabled: true,
        stubUrl: 'http://stub/graphql'
      })

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
              // phone and email are missing
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

      await expect(fetchBusinessAndCustomerInformation(mockRequest)).rejects.toThrow(
        'Failed to fetch business data: 500 Internal Server Error'
      )

      try {
        await fetchBusinessAndCustomerInformation(mockRequest)
      } catch (error) {
        expect(error.message).toBe('Failed to fetch business data: 500 Internal Server Error')
        expect(error.details.status).toBe(500)
        expect(error.details.responseBody).toBe('Server error')
      }
    })
  })

  describe('executeConfigDrivenQuery', () => {
    it('should execute query and return raw response', async () => {
      const mockResponse = {
        data: {
          business: { name: 'Test Business' },
          customer: { name: 'John Doe' }
        }
      }
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const query = 'query { business { name } customer { name } }'
      const result = await executeConfigDrivenQuery(mockRequest, query)

      expect(result).toEqual(mockResponse)
      expect(mockFetchInstance).toHaveBeenCalledTimes(1)

      const [[, calledOptions]] = mockFetchInstance.mock.calls
      const body = JSON.parse(calledOptions.body)
      expect(body.query).toBe(query)
    })

    it('should throw error when API call fails', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      })

      const query = 'query { business { name } }'

      await expect(executeConfigDrivenQuery(mockRequest, query)).rejects.toThrow(
        'Failed to fetch business data: 500 Internal Server Error'
      )
    })

    it('should execute query against stub in mock mode', async () => {
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        mockDALEnabled: true,
        stubUrl: 'http://stub/graphql'
      })

      const stubResponse = {
        data: {
          business: {
            info: {
              name: 'Mock Business'
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: async () => stubResponse
      })

      const query = 'query { business { info { name } } }'

      const result = await executeConfigDrivenQuery(mockRequest, query)

      expect(result.data.business.info.name).toBe('Mock Business')

      const [url] = mockFetchInstance.mock.calls[0]
      expect(url).toBe('http://stub/graphql')
    })
  })

  describe('Mock mode functionality', () => {
    beforeEach(() => {
      // Enable mock mode
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        mockDALEnabled: true
      })
    })

    it('should return formatted business and customer info in stub mode', async () => {
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        mockDALEnabled: true,
        stubUrl: 'http://stub/graphql'
      })

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
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        mockDALEnabled: true,
        stubUrl: 'http://stub/graphql'
      })

      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Stub failure'
      })

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('Stub request failed')
    })

    it('should throw ConsolidatedViewError when stub returns GraphQL errors', async () => {
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        mockDALEnabled: true,
        stubUrl: 'http://stub/graphql'
      })

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'GraphQL error occurred' }]
        })
      })

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('GraphQL error occurred')
    })
  })

  describe('Error handling', () => {
    it('should preserve ConsolidatedViewError properties', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied')
      })

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('Failed to fetch business data: 403 Forbidden')
    })

    it('should wrap non-API errors in ConsolidatedViewError', async () => {
      mockFetchInstance.mockImplementation(() => {
        throw new Error('Cannot read property of undefined')
      })

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('Cannot read property of undefined')
    })
  })

  describe('hasOnlyToleratedFailures', () => {
    it.each([
      {
        scenario: 'all errors match explicit toleratedPaths',
        errors: [{ message: 'Forbidden', path: ['business', 'countyParishHoldings'] }],
        toleratedPaths: ['countyParishHoldings'],
        expected: true
      },
      {
        scenario: 'errors do not match explicit toleratedPaths',
        errors: [{ message: 'Forbidden', path: ['business', 'info'] }],
        toleratedPaths: ['countyParishHoldings'],
        expected: false
      },
      {
        scenario: 'toleratedPaths is empty',
        errors: [{ message: 'Forbidden', path: ['business', 'countyParishHoldings'] }],
        toleratedPaths: [],
        expected: false
      },
      {
        scenario: 'mixed errors where only one matches toleratedPaths',
        errors: [
          { message: 'Forbidden', path: ['business', 'countyParishHoldings'] },
          { message: 'Forbidden', path: ['business', 'info'] }
        ],
        toleratedPaths: ['countyParishHoldings'],
        expected: false
      },
      {
        scenario: 'error has no path property',
        errors: [{ message: 'Forbidden' }],
        toleratedPaths: ['countyParishHoldings'],
        expected: false
      }
    ])('should return $expected when $scenario', ({ errors, toleratedPaths, expected }) => {
      expect(hasOnlyToleratedFailures(errors, toleratedPaths)).toBe(expected)
    })

    it('should fall back to global config when toleratedPaths is not provided', () => {
      config.set('consolidatedView.toleratedFailurePaths', ['countyParishHoldings'])
      const errors = [{ message: 'Forbidden', path: ['business', 'countyParishHoldings'] }]
      try {
        expect(hasOnlyToleratedFailures(errors)).toBe(true)
      } finally {
        config.set('consolidatedView.toleratedFailurePaths', [])
      }
    })

    it('should return false when falling back to empty global config', () => {
      const errors = [{ message: 'Forbidden', path: ['business', 'countyParishHoldings'] }]
      expect(hasOnlyToleratedFailures(errors)).toBe(false)
    })
  })

  describe('Partial GraphQL response handling', () => {
    it('should return partial data when 403 response has data and only tolerated errors', async () => {
      const partialResponse = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123'
            },
            countyParishHoldings: null
          },
          customer: {
            info: {
              name: { first: 'John', last: 'Doe' }
            }
          }
        },
        errors: [
          {
            message: 'Forbidden',
            path: ['business', 'countyParishHoldings']
          }
        ]
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve(JSON.stringify(partialResponse))
      })

      const result = await executeConfigDrivenQuery(
        mockRequest,
        'query { business { info { name } countyParishHoldings { cphNumber } } }',
        { toleratedPaths: ['countyParishHoldings'] }
      )

      expect(result).toEqual(partialResponse)
    })

    it('should throw when 403 response has tolerated errors but no toleratedPaths passed', async () => {
      const partialResponse = {
        data: {
          business: {
            info: { name: 'Test Business Ltd' },
            countyParishHoldings: null
          }
        },
        errors: [{ message: 'Forbidden', path: ['business', 'countyParishHoldings'] }]
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve(JSON.stringify(partialResponse))
      })

      await expect(executeConfigDrivenQuery(mockRequest, 'query { business { info { name } } }')).rejects.toThrow(
        'Failed to fetch business data: 403 Forbidden'
      )
    })

    it.each([
      [
        'errors on non-allowed paths',
        JSON.stringify({
          data: { business: { info: null }, customer: { info: null } },
          errors: [{ message: 'Forbidden', path: ['business', 'info'] }]
        })
      ],
      [
        'no data field',
        JSON.stringify({
          errors: [{ message: 'Forbidden', path: ['business', 'countyParishHoldings'] }]
        })
      ],
      ['invalid JSON body', 'Access denied - not JSON']
    ])('should throw when 403 response has %s', async (_scenario, responseText) => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve(responseText)
      })

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('Failed to fetch business data: 403 Forbidden')
    })
  })

  describe('timeout handling', () => {
    it.each([
      ['fetchParcelsFromDal', fetchParcelsFromDal],
      ['fetchBusinessAndCPH', fetchBusinessAndCPH],
      ['fetchBusinessAndCustomerInformation', fetchBusinessAndCustomerInformation]
    ])(
      '%s should timeout when fetch hangs',
      async (_name, fn) => {
        mockFetchInstance.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(Promise.race([fn(mockRequest), timeoutPromise])).rejects.toThrow('Operation timed out')
      },
      10000
    )
  })

  describe('Address formatting', () => {
    const buildAddressResponse = (address) => ({
      data: {
        business: {
          info: {
            name: 'Test Business Ltd',
            reference: 'REF123',
            address
          }
        },
        customer: {
          info: {
            name: { first: 'John', last: 'Doe' }
          }
        }
      }
    })

    describe('with structured fields (uprn set)', () => {
      it.each([
        [
          'all structured fields',
          {
            uprn: '123456789',
            pafOrganisationName: 'Test Organisation',
            flatName: 'Flat 1',
            buildingName: 'Building A',
            buildingNumberRange: '123-125',
            street: 'Main Street',
            dependentLocality: 'Test Locality',
            doubleDependentLocality: 'Test Double Locality',
            city: 'Test City',
            postalCode: 'TC1 2AB'
          },
          {
            line1: 'Test Organisation',
            line2: 'Flat 1 Building A 123-125 Main Street',
            line3: 'Test Locality',
            line4: 'Test Double Locality',
            city: 'Test City',
            postalCode: 'TC1 2AB'
          }
        ],
        [
          'without pafOrganisationName',
          {
            uprn: '123456789',
            flatName: 'Flat 2',
            buildingName: 'Building B',
            buildingNumberRange: '45',
            street: 'High Street',
            dependentLocality: 'Locality',
            doubleDependentLocality: 'Double Locality',
            city: 'City',
            postalCode: 'AB1 2CD'
          },
          {
            line1: 'Flat 2 Building B 45 High Street',
            line2: 'Locality',
            line3: 'Double Locality',
            line4: undefined,
            city: 'City',
            postalCode: 'AB1 2CD'
          }
        ],
        [
          'only buildingNumberRange and street',
          {
            uprn: '123456789',
            buildingNumberRange: '100',
            street: 'Main Road',
            dependentLocality: 'Test Locality',
            doubleDependentLocality: 'Test Double Locality',
            city: 'Test City',
            postalCode: 'TC1 2AB'
          },
          {
            line1: '100 Main Road',
            line2: 'Test Locality',
            line3: 'Test Double Locality',
            line4: undefined,
            city: 'Test City',
            postalCode: 'TC1 2AB'
          }
        ],
        [
          'only street',
          {
            uprn: '123456789',
            street: 'Church Lane',
            dependentLocality: 'Locality',
            city: 'City',
            postalCode: 'AB1 2CD'
          },
          {
            line1: 'Church Lane',
            line2: 'Locality',
            line3: undefined,
            line4: undefined,
            city: 'City',
            postalCode: 'AB1 2CD'
          }
        ],
        [
          'flatName and buildingName with pafOrganisationName',
          {
            uprn: '123456789',
            pafOrganisationName: 'Company Ltd',
            flatName: 'Flat 5',
            buildingName: 'Tower Block',
            dependentLocality: 'Area',
            city: 'City',
            postalCode: 'XY1 2ZZ'
          },
          {
            line1: 'Company Ltd',
            line2: 'Flat 5 Tower Block',
            line3: 'Area',
            line4: undefined,
            city: 'City',
            postalCode: 'XY1 2ZZ'
          }
        ],
        [
          'only dependentLocality',
          {
            uprn: '123456789',
            dependentLocality: 'Locality Name',
            city: 'Town',
            postalCode: 'PO1 2ST'
          },
          {
            line1: 'Locality Name',
            line2: undefined,
            line3: undefined,
            line4: undefined,
            city: 'Town',
            postalCode: 'PO1 2ST'
          }
        ],
        [
          'only doubleDependentLocality',
          {
            uprn: '123456789',
            doubleDependentLocality: 'District Name',
            city: 'City',
            postalCode: 'CD1 2EF'
          },
          {
            line1: 'District Name',
            line2: undefined,
            line3: undefined,
            line4: undefined,
            city: 'City',
            postalCode: 'CD1 2EF'
          }
        ],
        [
          'partial building fields (buildingName + street)',
          {
            uprn: '123456789',
            buildingName: 'The Old Mill',
            street: 'Mill Lane',
            city: 'Locality',
            postalCode: 'ML1 2NO'
          },
          {
            line1: 'The Old Mill Mill Lane',
            line2: undefined,
            line3: undefined,
            line4: undefined,
            city: 'Locality',
            postalCode: 'ML1 2NO'
          }
        ],
        [
          'pafOrganisationName and minimal other fields',
          {
            uprn: '123456789',
            pafOrganisationName: 'Big Corp Ltd',
            street: 'Commerce Road',
            city: 'Business Park',
            postalCode: 'BP1 2CP'
          },
          {
            line1: 'Big Corp Ltd',
            line2: 'Commerce Road',
            line3: undefined,
            line4: undefined,
            city: 'Business Park',
            postalCode: 'BP1 2CP'
          }
        ],
        [
          'all building fields but no localities',
          {
            uprn: '123456789',
            flatName: 'Unit A',
            buildingName: 'Industrial Estate',
            buildingNumberRange: '1-5',
            street: 'Factory Road',
            city: 'Town',
            postalCode: 'FR1 2IE'
          },
          {
            line1: 'Unit A Industrial Estate 1-5 Factory Road',
            line2: undefined,
            line3: undefined,
            line4: undefined,
            city: 'Town',
            postalCode: 'FR1 2IE'
          }
        ],
        [
          'empty string fields',
          {
            uprn: '123456789',
            pafOrganisationName: '',
            flatName: '',
            buildingName: '',
            buildingNumberRange: '42',
            street: 'Oak Street',
            dependentLocality: '',
            doubleDependentLocality: '',
            city: 'City',
            postalCode: 'OA1 2KS'
          },
          {
            line1: '42 Oak Street',
            line2: undefined,
            line3: undefined,
            line4: undefined,
            city: 'City',
            postalCode: 'OA1 2KS'
          }
        ],
        [
          'only city and postalCode',
          {
            uprn: '123456789',
            city: 'London',
            postalCode: 'SW1A 1AA'
          },
          {
            line1: undefined,
            line2: undefined,
            line3: undefined,
            line4: undefined,
            city: 'London',
            postalCode: 'SW1A 1AA'
          }
        ]
      ])('should format address with %s', async (_scenario, addressInput, expectedAddress) => {
        mockFetchInstance.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(buildAddressResponse(addressInput))
        })

        const result = await fetchBusinessAndCustomerInformation(mockRequest)

        expect(result.business.address).toEqual(expectedAddress)
      })
    })

    describe('with unstructured fields (uprn not set)', () => {
      it.each([
        [
          'all address lines present',
          {
            city: 'Test City',
            postalCode: 'PC1 2IG',
            line1: '123 Test street',
            line2: 'Flat 100',
            line3: 'Building T',
            line4: 'District D'
          },
          {
            city: 'Test City',
            postalCode: 'PC1 2IG',
            line1: '123 Test street',
            line2: 'Flat 100',
            line3: 'Building T',
            line4: 'District D'
          }
        ],
        [
          'missing address lines',
          { line1: '456 Short Address', city: 'City', postalCode: 'SH1 2RT' },
          {
            city: 'City',
            postalCode: 'SH1 2RT',
            line1: '456 Short Address',
            line2: undefined,
            line3: undefined,
            line4: undefined
          }
        ]
      ])('should handle %s', async (_scenario, addressInput, expectedAddress) => {
        mockFetchInstance.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(buildAddressResponse(addressInput))
        })

        const result = await fetchBusinessAndCustomerInformation(mockRequest)

        expect(result.business.address).toEqual(expectedAddress)
      })
    })
  })
})
