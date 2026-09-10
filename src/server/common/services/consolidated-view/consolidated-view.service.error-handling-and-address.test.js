import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { mockFetch } from '~/src/__mocks__'
import {
  fetchBusinessAndCustomerInformation,
  fetchParcelsFromDal,
  executeConfigDrivenQuery,
  hasOnlyToleratedFailures,
  fetchBusinessAndCPH,
  fetchBusinessPermissions
} from './consolidated-view.service.js'
import { mockRequest, resetConsolidatedViewMocks } from './consolidated-view.service.test-helpers.js'

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

describe('Consolidated View Service - Error handling and address formatting', () => {
  beforeEach(() => resetConsolidatedViewMocks(mockFetchInstance))

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

    it.each([
      ['fetchBusinessAndCPH', () => fetchBusinessAndCPH(mockRequest)],
      ['fetchBusinessPermissions', () => fetchBusinessPermissions(mockRequest)],
      ['executeConfigDrivenQuery', () => executeConfigDrivenQuery(mockRequest, 'query { business { name } }')]
    ])('%s should throw when API call fails with 500', async (_name, fn) => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      })

      await expect(fn()).rejects.toThrow('Failed to fetch business data: 500 Internal Server Error')
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
