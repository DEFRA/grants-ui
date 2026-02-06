import { vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { config } from '~/src/config/config.js'
import { mockFetch } from '~/src/__mocks__'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import {
  fetchBusinessAndCustomerInformation,
  fetchParcelsFromDal,
  executeConfigDrivenQuery
} from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { ConsolidatedViewApiError, fetchBusinessAndCPH } from './consolidated-view.service.js'
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

const getSBIMockFilePath = (sbi) => {
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

const getCRNMockFilePath = (crn) => {
  return path.join(process.cwd(), 'src', 'server', 'common', 'services', 'consolidated-view', 'crn-data', `${crn}.json`)
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

    it('should work correctly in mock mode', async () => {
      // Enable mock mode
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        mockDALEnabled: true
      })

      const mockSBIFileData = {
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
          }
        }
      }

      const mockCRNFileData = {
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

      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockSBIFileData))
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockCRNFileData))

      const result = await fetchBusinessAndCPH(mockRequest)

      expect(result).toEqual({
        business: mockSBIFileData.data.business.info,
        countyParishHoldings: 'MOCK-CPH67890',
        customer: mockCRNFileData.customer.info
      })
      expect(fs.readFile).toHaveBeenCalledTimes(2)
      expect(mockFetchInstance).not.toHaveBeenCalled()
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
      mockFetchInstance.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      })

      await expect(fetchBusinessAndCustomerInformation(mockRequest)).rejects.toThrow(
        new ConsolidatedViewApiError(
          'Failed to fetch business data: 500 Internal Server Error',
          500,
          'Failed to fetch business data: 500 Internal Server Error',
          mockSbi
        )
      )
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

    it('should work correctly in mock mode', async () => {
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        mockDALEnabled: true
      })

      const mockSBIFileData = {
        data: {
          business: { info: { name: 'Mock Business' } }
        }
      }
      const mockCRNFileData = {
        customer: { info: { name: { first: 'Jane' } } }
      }

      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockSBIFileData))
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockCRNFileData))

      const query = 'query { business { info { name } } }'
      const result = await executeConfigDrivenQuery(mockRequest, query)

      expect(result.data.business.info.name).toBe('Mock Business')
      expect(mockFetchInstance).not.toHaveBeenCalled()
    })
  })

  describe('Mock mode functionality', () => {
    const mockSBIFileData = {
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
            reference: 'MOCK-REF456',
            email: { address: 'mock@business.com' },
            phone: { mobile: '07987654321', landline: '01987654321' },
            address: {
              line1: '456 Mock Street',
              city: 'Mock City',
              postalCode: 'MC1 2DE'
            }
          }
        }
      }
    }

    const mockCRNFileData = {
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

    beforeEach(() => {
      // Enable mock mode
      config.set('consolidatedView', {
        apiEndpoint: 'https://api.example.com/graphql',
        mockDALEnabled: true
      })
    })

    it('should read mock data from file for parcels', async () => {
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockSBIFileData))
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockCRNFileData))

      const result = await fetchParcelsFromDal(mockRequest)

      expect(result).toEqual(mockSBIFileData.data.business.land.parcels)
      expect(fs.readFile).toHaveBeenCalledTimes(2)
      expect(fs.readFile).toHaveBeenCalledWith(getSBIMockFilePath(mockSbi), 'utf8')
      expect(fs.readFile).toHaveBeenCalledWith(getCRNMockFilePath(mockCrn), 'utf8')
      expect(mockFetchInstance).not.toHaveBeenCalled()
      expect(getValidToken).not.toHaveBeenCalled()
    })

    it('should read mock data from file for business and customer info', async () => {
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockSBIFileData))
      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockCRNFileData))

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
        customer: mockCRNFileData.customer.info
      })
      expect(fs.readFile).toHaveBeenCalledTimes(2)
      expect(mockFetchInstance).not.toHaveBeenCalled()
    })

    it('should handle file not found error', async () => {
      const fileError = new Error('ENOENT: no such file or directory')
      fileError.code = 'ENOENT'
      fs.readFile.mockRejectedValueOnce(fileError)

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow('ENOENT: no such file or directory')
    })

    it('should handle invalid JSON in mock file', async () => {
      fs.readFile.mockResolvedValueOnce('invalid json content')

      await expect(fetchParcelsFromDal(mockRequest)).rejects.toThrow()
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

  describe('timeout handling', () => {
    describe('fetchParcelsFromDal', () => {
      it('should timeout when fetch hangs', async () => {
        mockFetchInstance.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(Promise.race([fetchParcelsFromDal(mockRequest), timeoutPromise])).rejects.toThrow(
          'Operation timed out'
        )
      }, 10000)
    })

    describe('fetchBusinessAndCPH', () => {
      it('should timeout when fetch hangs', async () => {
        mockFetchInstance.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(Promise.race([fetchBusinessAndCPH(mockRequest), timeoutPromise])).rejects.toThrow(
          'Operation timed out'
        )
      }, 10000)
    })

    describe('fetchBusinessAndCustomerInformation', () => {
      it('should timeout when fetch hangs', async () => {
        mockFetchInstance.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(Promise.race([fetchBusinessAndCustomerInformation(mockRequest), timeoutPromise])).rejects.toThrow(
          'Operation timed out'
        )
      }, 10000)
    })
  })

  describe('Address formatting with structured fields (uprn set)', () => {
    it('should format address with all structured fields present', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
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
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: 'Test Organisation',
        line2: 'Flat 1 Building A 123-125 Main Street',
        line3: 'Test Locality',
        line4: 'Test Double Locality',
        city: 'Test City',
        postalCode: 'TC1 2AB'
      })
    })

    it('should format address without pafOrganisationName', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                uprn: '123456789',
                flatName: 'Flat 2',
                buildingName: 'Building B',
                buildingNumberRange: '45',
                street: 'High Street',
                dependentLocality: 'Locality',
                doubleDependentLocality: 'Double Locality',
                city: 'City',
                postalCode: 'AB1 2CD'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'Jane',
                last: 'Smith'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: 'Flat 2 Building B 45 High Street',
        line2: 'Locality',
        line3: 'Double Locality',
        line4: undefined,
        city: 'City',
        postalCode: 'AB1 2CD'
      })
    })

    it('should format address with only buildingNumberRange and street', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                uprn: '123456789',
                buildingNumberRange: '100',
                street: 'Main Road',
                dependentLocality: 'Test Locality',
                doubleDependentLocality: 'Test Double Locality',
                city: 'Test City',
                postalCode: 'TC1 2AB'
              }
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
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: '100 Main Road',
        line2: 'Test Locality',
        line3: 'Test Double Locality',
        line4: undefined,
        city: 'Test City',
        postalCode: 'TC1 2AB'
      })
    })

    it('should format address with only street', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                uprn: '123456789',
                street: 'Church Lane',
                dependentLocality: 'Locality',
                city: 'City',
                postalCode: 'AB1 2CD'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'Jane',
                last: 'Smith'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        city: 'City',
        postalCode: 'AB1 2CD',
        line1: 'Church Lane',
        line2: 'Locality',
        line3: undefined,
        line4: undefined
      })
    })

    it('should format address with flatName and buildingName only', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                uprn: '123456789',
                pafOrganisationName: 'Company Ltd',
                flatName: 'Flat 5',
                buildingName: 'Tower Block',
                dependentLocality: 'Area',
                city: 'City',
                postalCode: 'XY1 2ZZ'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'Bob',
                last: 'Jones'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: 'Company Ltd',
        line2: 'Flat 5 Tower Block',
        line3: 'Area',
        line4: undefined,
        city: 'City',
        postalCode: 'XY1 2ZZ'
      })
    })

    it('should format address with only dependentLocality', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                uprn: '123456789',
                dependentLocality: 'Locality Name',
                city: 'Town',
                postalCode: 'PO1 2ST'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'Alice',
                last: 'Brown'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: 'Locality Name',
        line2: undefined,
        line3: undefined,
        line4: undefined,
        city: 'Town',
        postalCode: 'PO1 2ST'
      })
    })

    it('should format address with only doubleDependentLocality', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                uprn: '123456789',
                doubleDependentLocality: 'District Name',
                city: 'City',
                postalCode: 'CD1 2EF'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'Charlie',
                last: 'Test'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: 'District Name',
        line2: undefined,
        line3: undefined,
        line4: undefined,
        city: 'City',
        postalCode: 'CD1 2EF'
      })
    })

    it('should format address with partial building fields', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                uprn: '123456789',
                buildingName: 'The Old Mill',
                street: 'Mill Lane',
                city: 'Locality',
                postalCode: 'ML1 2NO'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'David',
                last: 'Green'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: 'The Old Mill Mill Lane',
        line2: undefined,
        line3: undefined,
        line4: undefined,
        city: 'Locality',
        postalCode: 'ML1 2NO'
      })
    })

    it('should format address with pafOrganisationName and minimal other fields', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                uprn: '123456789',
                pafOrganisationName: 'Big Corp Ltd',
                street: 'Commerce Road',
                city: 'Business Park',
                postalCode: 'BP1 2CP'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'Eve',
                last: 'Black'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: 'Big Corp Ltd',
        line2: 'Commerce Road',
        line3: undefined,
        line4: undefined,
        city: 'Business Park',
        postalCode: 'BP1 2CP'
      })
    })

    it('should format address with all building fields but no localities', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                uprn: '123456789',
                flatName: 'Unit A',
                buildingName: 'Industrial Estate',
                buildingNumberRange: '1-5',
                street: 'Factory Road',
                city: 'Town',
                postalCode: 'FR1 2IE'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'Frank',
                last: 'Yellow'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: 'Unit A Industrial Estate 1-5 Factory Road',
        line2: undefined,
        line3: undefined,
        line4: undefined,
        city: 'Town',
        postalCode: 'FR1 2IE'
      })
    })

    it('should handle UPRN with empty string fields', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
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
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'George',
                last: 'Purple'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: '42 Oak Street',
        line2: undefined,
        line3: undefined,
        line4: undefined,
        city: 'City',
        postalCode: 'OA1 2KS'
      })
    })

    it('should handle UPRN with only city and postalCode', async () => {
      const responseWithUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                uprn: '123456789',
                city: 'London',
                postalCode: 'SW1A 1AA'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'Henry',
                last: 'Orange'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        line1: undefined,
        line2: undefined,
        line3: undefined,
        line4: undefined,
        city: 'London',
        postalCode: 'SW1A 1AA'
      })
    })
  })

  describe('Address formatting with unstructured fields (uprn not set)', () => {
    it('should return original address fields unchanged', async () => {
      const responseWithoutUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                city: 'Test City',
                postalCode: 'PC1 2IG',
                line1: '123 Test street',
                line2: 'Flat 100',
                line3: 'Building T',
                line4: 'District D'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'John',
                last: 'Test'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithoutUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        city: 'Test City',
        postalCode: 'PC1 2IG',
        line1: '123 Test street',
        line2: 'Flat 100',
        line3: 'Building T',
        line4: 'District D'
      })
    })

    it('should handle missing address lines', async () => {
      const responseWithoutUPRN = {
        data: {
          business: {
            info: {
              name: 'Test Business Ltd',
              reference: 'REF123',
              address: {
                line1: '456 Short Address',
                city: 'City',
                postalCode: 'SH1 2RT'
              }
            }
          },
          customer: {
            info: {
              name: {
                first: 'Julia',
                last: 'Grey'
              }
            }
          }
        }
      }

      mockFetchInstance.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithoutUPRN)
      })

      const result = await fetchBusinessAndCustomerInformation(mockRequest)

      expect(result.business.address).toEqual({
        city: 'City',
        postalCode: 'SH1 2RT',
        line1: '456 Short Address',
        line2: undefined,
        line3: undefined,
        line4: undefined
      })
    })
  })
})
