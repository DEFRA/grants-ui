import { vi } from 'vitest'
import { buildDemoData } from './build-demo-data.js'

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

      expect(mockConfig.get).toHaveBeenCalledWith('devTools.demoData.referenceNumber')
      expect(mockConfig.get).toHaveBeenCalledWith('devTools.demoData.businessName')
      expect(mockConfig.get).toHaveBeenCalledWith('devTools.demoData.sbi')
      expect(mockConfig.get).toHaveBeenCalledWith('devTools.demoData.contactName')

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

    test('should call config.get for each required field', () => {
      buildDemoData()

      expect(mockConfig.get).toHaveBeenCalledTimes(4)
      expect(mockConfig.get).toHaveBeenNthCalledWith(1, 'devTools.demoData.referenceNumber')
      expect(mockConfig.get).toHaveBeenNthCalledWith(2, 'devTools.demoData.businessName')
      expect(mockConfig.get).toHaveBeenNthCalledWith(3, 'devTools.demoData.sbi')
      expect(mockConfig.get).toHaveBeenNthCalledWith(4, 'devTools.demoData.contactName')
    })

    const configScenarios = [
      {
        name: 'production-like values',
        values: {
          'devTools.demoData.referenceNumber': 'PROD2024001',
          'devTools.demoData.businessName': 'Production Test Farm',
          'devTools.demoData.sbi': '123456789',
          'devTools.demoData.contactName': 'Production User'
        }
      },
      {
        name: 'development values with special characters',
        values: {
          'devTools.demoData.referenceNumber': 'DEV-123@TEST',
          'devTools.demoData.businessName': 'Test Farm "Quotes" & Chars',
          'devTools.demoData.sbi': 'SBI-999',
          'devTools.demoData.contactName': "John O'Connor"
        }
      },
      {
        name: 'empty string values',
        values: {
          'devTools.demoData.referenceNumber': '',
          'devTools.demoData.businessName': '',
          'devTools.demoData.sbi': '',
          'devTools.demoData.contactName': ''
        }
      },
      {
        name: 'mixed null and undefined values',
        values: {
          'devTools.demoData.referenceNumber': null,
          'devTools.demoData.businessName': undefined,
          'devTools.demoData.sbi': '',
          'devTools.demoData.contactName': 'Valid Name'
        }
      }
    ]

    test.each(configScenarios)(
      'should build demo data with $name',
      ({ values }) => {
        mockConfig.get.mockImplementation((key) => values[key])

        const result = buildDemoData()

        expect(result).toEqual({
          referenceNumber: values['devTools.demoData.referenceNumber'],
          businessName: values['devTools.demoData.businessName'],
          sbi: values['devTools.demoData.sbi'],
          contactName: values['devTools.demoData.contactName']
        })
      }
    )

    test('should handle config.get throwing an error', () => {
      mockConfig.get
        .mockReturnValueOnce('REF123')
        .mockImplementationOnce(() => {
          throw new Error('Config error')
        })

      expect(() => buildDemoData()).toThrow('Config error')
    })

    test('should return new object each time', () => {
      mockConfig.get.mockReturnValue('TEST_VALUE')

      const result1 = buildDemoData()
      const result2 = buildDemoData()

      expect(result1).toEqual(result2)
      expect(result1).not.toBe(result2) // Different object instances
    })
  })
})