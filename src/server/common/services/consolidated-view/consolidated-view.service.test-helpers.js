import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import { retry } from '~/src/server/common/helpers/retry.js'

export const mockSbi = 106284736
export const mockCrn = 'CRN123456'
export const mockToken = 'mock-token-123'
export const mockDefraIdToken = 'mock-defra-id-token-123'

export const mockRequest = {
  auth: {
    credentials: {
      sbi: mockSbi,
      crn: mockCrn,
      token: mockDefraIdToken
    }
  }
}

export const mockParcelsResponse = {
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

export const mockBusinessCustomerResponse = {
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

export const mockStubModeConfig = {
  apiEndpoint: 'https://api.example.com/graphql',
  mockDALEnabled: true,
  stubUrl: 'http://stub/graphql' // NOSONAR - local dev stub only, fetch is mocked in tests
}

/**
 * Also sets a baseline consolidatedView config (mock mode off); tests needing
 * stub mode override it via config.set before calling the service.
 */
export function resetConsolidatedViewMocks(mockFetchInstance) {
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
}
