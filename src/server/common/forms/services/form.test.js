import { formsService, configureFormDefinition } from './form.js'
import { config } from '~/src/config/config.js'

// Mock URL and import.meta.url
const mockUrl = { pathname: '/mock/path' }
global.URL = jest.fn(() => mockUrl)
global.import = { meta: { url: 'file:///mock/path' } }

// Mock config
const defaultConfigMock = {
  cdpEnvironment: 'local',
  log: {
    enabled: true,
    level: 'info',
    format: 'pino-pretty',
    redact: []
  },
  serviceName: 'test-service',
  serviceVersion: '1.0.0'
}

jest.mock('~/src/config/config.js', () => ({
  config: {
    get: jest.fn((key) => defaultConfigMock[key])
  }
}))

describe('form', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset config mock to default values
    config.get.mockImplementation((key) => defaultConfigMock[key])
  })

  describe('formsService', () => {
    test('returns exampleGrantDefinition for matching id', async () => {
      const service = await formsService()
      const result = service.getFormDefinition(
        '5eeb9f71-44f8-46ed-9412-3d5e2c5ab2bc'
      )
      await expect(result).resolves.toBeDefined()
    })

    test('returns landGrantsDefinition for matching id', async () => {
      const service = await formsService()
      const result = service.getFormDefinition(
        '5c67688f-3c61-4839-a6e1-d48b598257f1'
      )
      await expect(result).resolves.toBeDefined()
    })

    test('returns addingValueDefinition for matching id', async () => {
      const service = await formsService()
      const result = service.getFormDefinition(
        '95e92559-968d-44ae-8666-2b1ad3dffd31'
      )
      await expect(result).resolves.toBeDefined()
    })
  })

  describe('configureFormDefinition', () => {
    test('handles form definition without events', () => {
      const mockData = {
        name: 'no-events',
        pages: [{ title: 'Page 1' }]
      }

      const result = configureFormDefinition(mockData)
      expect(result).toEqual({
        name: 'no-events',
        pages: [{ title: 'Page 1' }]
      })
    })

    test('handles form definition with events but no onLoad', () => {
      const mockData = {
        name: 'no-onload',
        pages: [{ events: { otherEvent: {} } }]
      }
      const result = configureFormDefinition(mockData)

      expect(result).toEqual({
        name: 'no-onload',
        pages: [{ events: { otherEvent: {} } }]
      })
    })

    test('configures URLs correctly for local environment', () => {
      const mockData = {
        name: 'test-form',
        pages: [
          {
            events: {
              onLoad: {
                options: {
                  url: 'http://cdpEnvironment.example.com'
                }
              }
            }
          }
        ]
      }

      const result = configureFormDefinition(mockData)
      expect(result.pages[0].events.onLoad.options.url).toBe(
        'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
      )
    })

    test('configures URLs correctly for non-local environment', () => {
      // Override the config mock for this test only
      config.get.mockImplementation((key) =>
        key === 'cdpEnvironment' ? 'dev' : defaultConfigMock[key]
      )

      const mockData = {
        name: 'test-form',
        pages: [
          {
            events: {
              onLoad: {
                options: {
                  url: 'http://cdpEnvironment.example.com'
                }
              }
            }
          }
        ]
      }
      const result = configureFormDefinition(mockData)

      expect(result.pages[0].events.onLoad.options.url).toBe(
        'http://dev.example.com'
      )
    })

    test('handles form definition with multiple pages and events', () => {
      const mockData = {
        name: 'multi-page-form',
        pages: [
          {
            events: {
              onLoad: {
                options: {
                  url: 'http://cdpEnvironment.example.com'
                }
              }
            }
          },
          {
            events: {
              onLoad: {
                options: {
                  url: 'http://cdpEnvironment.example.com'
                }
              }
            }
          }
        ]
      }

      const result = configureFormDefinition(mockData)

      expect(result.pages).toHaveLength(2)
      result.pages.forEach((page) => {
        expect(page.events.onLoad.options.url).toBe(
          'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
        )
      })
    })

    test('handles form definition with undefined events', () => {
      const mockData = {
        name: 'test-form',
        pages: [
          {
            events: undefined
          }
        ]
      }

      const result = configureFormDefinition(mockData)

      expect(result.pages[0].events).toBeUndefined()
    })

    test('handles form definition with undefined pages', () => {
      const mockData = {
        name: 'test-form',
        pages: undefined
      }

      const result = configureFormDefinition(mockData)

      expect(result.pages).toBeUndefined()
    })
  })
})
