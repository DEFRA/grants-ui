import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { mockFetch } from '~/src/__mocks__'
import { fetchBusinessPermissions, executeConfigDrivenQuery } from './consolidated-view.service.js'
import {
  mockSbi,
  mockCrn,
  mockToken,
  mockRequest,
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

describe('Consolidated View Service - Permissions and query', () => {
  beforeEach(() => resetConsolidatedViewMocks(mockFetchInstance))

  describe('fetchBusinessPermissions', () => {
    const mockPermissionGroups = [
      {
        id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',
        level: 'SUBMIT',
        functions: ['View Applications', 'Submit CS Application']
      },
      {
        id: 'ENVIRONMENTAL_LAND_MANAGEMENT_APPLICATIONS',
        level: 'NO_ACCESS',
        functions: []
      }
    ]

    it('should fetch business permissions successfully', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              customer: {
                business: {
                  permissionGroups: mockPermissionGroups
                }
              }
            }
          })
      })

      const result = await fetchBusinessPermissions(mockRequest)

      expect(result).toEqual(mockPermissionGroups)

      expect(mockFetchInstance).toHaveBeenCalledTimes(1)

      const [[, calledOptions]] = mockFetchInstance.mock.calls

      expect(calledOptions.headers.Authorization).toBe(`Bearer ${mockToken}`)
      expect(calledOptions.headers['Content-Type']).toBe('application/json')

      const body = JSON.parse(calledOptions.body)

      expect(body.query).toContain(`business(sbi: "${mockSbi}")`)
      expect(body.query).toContain(`customer(crn: "${mockCrn}")`)
      expect(body.query).toContain('query GetBusinessPermissions')
      expect(body.query).toContain('permissionGroups')
      expect(body.query).toContain('id')
      expect(body.query).toContain('level')
      expect(body.query).toContain('functions')
    })

    it('should return empty array when business is null', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              customer: {
                business: null
              }
            }
          })
      })

      const result = await fetchBusinessPermissions(mockRequest)

      expect(result).toEqual([])
    })

    it('should return empty array when permissionGroups are missing', async () => {
      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              customer: {
                business: {}
              }
            }
          })
      })

      const result = await fetchBusinessPermissions(mockRequest)

      expect(result).toEqual([])
    })

    it('should execute query against stub in mock mode', async () => {
      config.set('consolidatedView', mockStubModeConfig)

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            customer: {
              business: {
                permissionGroups: mockPermissionGroups
              }
            }
          }
        })
      })

      const result = await fetchBusinessPermissions(mockRequest)

      expect(result).toEqual(mockPermissionGroups)

      const [url] = mockFetchInstance.mock.calls[0]

      expect(url).toBe('http://stub/graphql')
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

    it('should execute query against stub in mock mode', async () => {
      config.set('consolidatedView', mockStubModeConfig)

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

    it('should format address fields in the response using UPRN logic when uprn is present', async () => {
      const mockResponse = {
        data: {
          business: {
            info: {
              name: 'Test Farm',
              address: {
                line1: 'Brackenfold Farm',
                line2: 'Littondale Road',
                line3: null,
                line4: null,
                street: 'Littondale Road',
                city: 'Skipton',
                postalCode: 'BD23 5QH',
                uprn: '981124620011',
                buildingName: 'Brackenfold Farm',
                buildingNumberRange: null,
                county: 'North Yorkshire',
                dependentLocality: null,
                doubleDependentLocality: null,
                flatName: null,
                pafOrganisationName: 'Mellor & Sons'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await executeConfigDrivenQuery(mockRequest, 'query { business { info { address { line1 } } } }')

      expect(result.data.business.info.address).toEqual({
        line1: 'Mellor & Sons',
        line2: 'Brackenfold Farm Littondale Road',
        line3: undefined,
        line4: undefined,
        city: 'Skipton',
        postalCode: 'BD23 5QH'
      })
    })

    it('should leave customer address fields unformatted', async () => {
      const mockResponse = {
        data: {
          customer: {
            info: {
              address: {
                line1: '10 Downing Street',
                line2: 'Westminster',
                line3: null,
                line4: null,
                city: 'London',
                postalCode: 'SW1A 2AA'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await executeConfigDrivenQuery(mockRequest, 'query { customer { info { address { line1 } } } }')

      expect(result.data.customer.info.address).toEqual({
        line1: '10 Downing Street',
        line2: 'Westminster',
        line3: null,
        line4: null,
        city: 'London',
        postalCode: 'SW1A 2AA'
      })
    })
  })
})
