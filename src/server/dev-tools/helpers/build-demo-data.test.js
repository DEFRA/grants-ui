import { vi } from 'vitest'
import { buildDemoData, buildDemoMappedData, buildDemoRequest } from './build-demo-data.js'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

describe('build-demo-data', () => {
  let mockConfig

  beforeEach(async () => {
    vi.clearAllMocks()
    const config = await import('~/src/config/config.js')
    mockConfig = config.config
  })

  describe('buildDemoData', () => {
    test('should build demo data from configuration', () => {
      const mockConfigValues = {
        'devTools.demoData.referenceNumber': 'DEMO123',
        'devTools.demoData.businessName': 'Demo Business Ltd',
        'devTools.demoData.sbi': '999888777',
        'devTools.demoData.contactName': 'Demo Contact'
      }

      mockConfig.get.mockImplementation((key) => mockConfigValues[key])

      const result = buildDemoData()

      expect(result).toEqual({
        referenceNumber: 'DEMO123',
        businessName: 'Demo Business Ltd',
        sbi: '999888777',
        contactName: 'Demo Contact'
      })
    })

    test('should handle missing configuration values', () => {
      mockConfig.get.mockReturnValue(undefined)

      const result = buildDemoData()

      expect(result).toEqual({
        referenceNumber: undefined,
        businessName: undefined,
        sbi: undefined,
        contactName: undefined
      })
    })
  })

  describe('buildDemoMappedData', () => {
    test('should return mapped data from configuration', () => {
      const mockMappedData = {
        customer: { name: { first: 'John', last: 'Smith' } },
        business: { name: 'Test Farm' }
      }

      mockConfig.get.mockReturnValue(mockMappedData)

      const result = buildDemoMappedData()

      expect(mockConfig.get).toHaveBeenCalledWith('devTools.mappedData')
      expect(result).toEqual(mockMappedData)
    })
  })

  describe('buildDemoRequest', () => {
    test('should return mock request with credentials', () => {
      const mockConfigValues = {
        'devTools.demoData.sbi': '999888777',
        'devTools.demoData.crn': '1234567890'
      }

      mockConfig.get.mockImplementation((key) => mockConfigValues[key])

      const result = buildDemoRequest()

      expect(result).toEqual({
        auth: {
          credentials: {
            sbi: '999888777',
            crn: '1234567890'
          }
        }
      })
    })
  })
})
