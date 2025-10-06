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
