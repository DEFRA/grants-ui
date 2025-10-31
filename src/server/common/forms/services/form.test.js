import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import {
  addAllForms,
  configureFormDefinition,
  formsService,
  getFormsCache,
  validateGrantRedirectRules,
  validateWhitelistConfiguration
} from './form.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import fs from 'node:fs/promises'

const mockUrl = { pathname: '/mock/path' }
global.URL = vi.fn(() => mockUrl)
global.import = { meta: { url: 'file:///mock/path' } }

const DEFAULT_CONFIG_MOCK = {
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

const TEST_FORMS_ARRAY = [
  {
    path: 'path/to/form1.yaml',
    id: 'form-id-1',
    slug: 'form-slug-1',
    title: 'Form 1'
  },
  {
    path: 'path/to/form2.yaml',
    id: 'form-id-2',
    slug: 'form-slug-2',
    title: 'Form 2'
  },
  {
    path: 'path/to/form1-duplicate.yaml',
    id: 'form-id-1',
    slug: 'form-slug-1',
    title: 'Form 1 Duplicate'
  },
  {
    path: 'path/to/form3.yaml',
    id: 'form-id-3',
    slug: 'form-slug-3',
    title: 'Form 3',
    metadata: {
      whitelistCrnEnvVar: 'TEST_WHITELIST_CRNS',
      whitelistSbiEnvVar: 'TEST_WHITELIST_SBIS'
    }
  }
]

const UNIQUE_FORMS_ARRAY = [
  {
    path: 'path/to/form1.yaml',
    id: 'form-id-1',
    slug: 'form-slug-1',
    title: 'Form 1'
  },
  {
    path: 'path/to/form2.yaml',
    id: 'form-id-2',
    slug: 'form-slug-2',
    title: 'Form 2'
  }
]

vi.mock('~/src/config/config.js', async () => {
  const { mockConfig } = await import('~/src/__mocks__')
  const configData = {
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
  return mockConfig(configData)
})

vi.mock('~/src/server/common/helpers/logging/logger.js', async () => {
  const { mockLoggerFactoryWithCustomMethods } = await import('~/src/__mocks__')
  const { vi: vitest } = await import('vitest')
  return mockLoggerFactoryWithCustomMethods({
    warn: vitest.fn(),
    error: vitest.fn()
  })
})

vi.mock('../config.js', () => ({
  metadata: {
    organisation: 'Test Org',
    teamName: 'Test Team',
    teamEmail: 'test@example.com'
  }
}))

const mockEnv = {
  EXAMPLE_WHITELIST_CRNS: '1101009926,1101010029',
  EXAMPLE_WHITELIST_SBIS: '123456789,987654321'
}

Object.defineProperty(process, 'env', {
  value: new Proxy(process.env, {
    get(target, prop) {
      if (prop in mockEnv) {
        return mockEnv[prop]
      }
      return target[prop]
    },
    has(target, prop) {
      return prop in mockEnv || prop in target
    },
    deleteProperty(target, prop) {
      if (prop in mockEnv) {
        delete mockEnv[prop]
        return true
      }
      return delete target[prop]
    }
  })
})

describe('form', () => {
  let mockWarn, mockError, logger

  beforeEach(() => {
    vi.clearAllMocks()
    config.get.mockImplementation((key) => DEFAULT_CONFIG_MOCK[key])
    // Get the warn function from the mocked logger
    logger = vi.mocked(createLogger)()
    mockWarn = logger.warn
    mockError = logger.error

    mockEnv.EXAMPLE_WHITELIST_CRNS = '1101009926,1101010029'
    mockEnv.EXAMPLE_WHITELIST_SBIS = '123456789,987654321'
    mockEnv.FARMING_PAYMENTS_WHITELIST_CRNS = '1102838829, 1102760349, 1100495932'
    mockEnv.FARMING_PAYMENTS_WHITELIST_SBIS = '106284736, 121428499, 106238988'
  })

  afterEach(() => {})

  describe('formsService', () => {
    test('returns landGrantsDefinition for matching id', async () => {
      const service = await formsService()
      const result = service.getFormDefinition('5c67688f-3c61-4839-a6e1-d48b598257f1')
      await expect(result).resolves.toBeDefined()
    })

    test('returns addingValueDefinition for matching id', async () => {
      const service = await formsService()
      const result = service.getFormDefinition('95e92559-968d-44ae-8666-2b1ad3dffd31')
      await expect(result).resolves.toBeDefined()
    })

    test('throws error for unknown id', async () => {
      const service = await formsService()
      await expect(service.getFormDefinition('unknown-id')).rejects.toThrow()
    })

    test('getFormMetadata throws notFound boom error for unknown slug', async () => {
      const service = await formsService()
      const error = await service.getFormMetadata('unknown-slug').catch((e) => e)
      expect(error.isBoom).toBe(true)
      expect(error.output.statusCode).toBe(404)
      expect(error.message).toContain("Form 'unknown-slug' not found")
    })

    test('getFormDefinition throws notFound boom error for unknown id', async () => {
      const service = await formsService()
      const error = await service.getFormDefinition('unknown-id').catch((e) => e)
      expect(error.isBoom).toBe(true)
      expect(error.output.statusCode).toBe(404)
      expect(error.message).toContain("Form definition 'unknown-id' not found")
    })
  })

  describe('configureFormDefinition', () => {
    it.each([
      [
        'local environment',
        'local',
        'http://ffc-grants-scoring:3002/scoring/api/v1/adding-value/score?allowPartialScoring=true'
      ],
      ['non-local environment', 'dev', 'http://dev.example.com']
    ])('configures URLs correctly for %s', (_description, environment, expectedUrl) => {
      config.get.mockImplementation((key) => (key === 'cdpEnvironment' ? environment : DEFAULT_CONFIG_MOCK[key]))

      const definition = {
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

      const result = configureFormDefinition(definition)
      expect(result.pages[0].events.onLoad.options.url).toBe(expectedUrl)
    })

    test('handles form definition without events', () => {
      const definition = {
        pages: [{ title: 'Page 1' }]
      }

      const result = configureFormDefinition(definition)
      expect(result).toEqual(definition)
    })

    test('handles form definition without pages', () => {
      const definition = {
        name: 'test-form'
      }

      const result = configureFormDefinition(definition)
      expect(result).toEqual(definition)
    })

    test('handles form definition with multiple pages', () => {
      const definition = {
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

      const result = configureFormDefinition(definition)
      expect(result.pages).toHaveLength(2)
      result.pages.forEach((page) => {
        expect(page.events.onLoad.options.url).toBe(
          'http://ffc-grants-scoring:3002/scoring/api/v1/adding-value/score?allowPartialScoring=true'
        )
      })
    })

    test('logs warning when events exist but no onLoad URL is present', () => {
      const definition = {
        pages: [
          {
            events: {
              onSubmit: {
                options: {
                  action: 'submit'
                }
              }
            }
          }
        ]
      }

      const result = configureFormDefinition(definition)

      expect(mockWarn).toHaveBeenCalledWith(`Unexpected environment value: ${DEFAULT_CONFIG_MOCK.cdpEnvironment}`)

      expect(result).toEqual(definition)
    })
  })

  describe('addAllForms', () => {
    const createMockLoader = () => ({
      addForm: vi.fn().mockResolvedValue(undefined)
    })

    test('handles duplicate forms and logs warning', async () => {
      const mockLoader = createMockLoader()
      const result = await addAllForms(mockLoader, TEST_FORMS_ARRAY)

      expect(mockWarn).toHaveBeenCalledWith('Skipping duplicate form: form-slug-1 with id form-id-1')
      expect(result).toBe(3)
      expect(mockLoader.addForm).toHaveBeenCalledTimes(3)
      expect(mockLoader.addForm).not.toHaveBeenCalledWith('path/to/form1-duplicate.yaml', expect.any(Object))

      expect(mockLoader.addForm).toHaveBeenCalledWith(
        'path/to/form1.yaml',
        expect.objectContaining({
          id: 'form-id-1',
          slug: 'form-slug-1',
          title: 'Form 1'
        })
      )
      expect(mockLoader.addForm).toHaveBeenCalledWith(
        'path/to/form2.yaml',
        expect.objectContaining({
          id: 'form-id-2',
          slug: 'form-slug-2',
          title: 'Form 2'
        })
      )
      expect(mockLoader.addForm).toHaveBeenCalledWith(
        'path/to/form3.yaml',
        expect.objectContaining({
          id: 'form-id-3',
          slug: 'form-slug-3',
          title: 'Form 3',
          metadata: {
            whitelistCrnEnvVar: 'TEST_WHITELIST_CRNS',
            whitelistSbiEnvVar: 'TEST_WHITELIST_SBIS'
          }
        })
      )
    })

    test('handles empty forms array', async () => {
      const mockLoader = { addForm: vi.fn() }
      const result = await addAllForms(mockLoader, [])

      expect(result).toBe(0)
      expect(mockLoader.addForm).not.toHaveBeenCalled()
      expect(mockWarn).not.toHaveBeenCalled()
    })

    test('handles all unique forms', async () => {
      const mockLoader = createMockLoader()
      const result = await addAllForms(mockLoader, UNIQUE_FORMS_ARRAY)

      expect(result).toBe(2)
      expect(mockLoader.addForm).toHaveBeenCalledTimes(2)
      expect(mockWarn).not.toHaveBeenCalled()
    })
  })

  describe('discoverFormsFromYaml', () => {
    test('ignores non-YAML files', async () => {
      const readdirSpy = vi
        .spyOn(fs, 'readdir')
        .mockResolvedValueOnce([{ name: 'notes.txt', isDirectory: () => false, isFile: () => true }])

      await expect(formsService()).resolves.toBeDefined()

      // Assert that no errors were logged and formsCache is empty
      expect(mockError).not.toHaveBeenCalled()
      expect(getFormsCache()).toEqual([])

      readdirSpy.mockRestore()
    })

    test('logs error when reading forms directory fails', async () => {
      const readdirSpy = vi.spyOn(fs, 'readdir').mockRejectedValueOnce(new Error('read error'))

      await expect(formsService()).resolves.toBeDefined()

      expect(mockError).toHaveBeenCalled()
      expect(mockError.mock.calls[0][0]).toContain('Failed to read forms directory')

      readdirSpy.mockRestore()
    })

    test('skips files that contain a tasklist', async () => {
      const readdirSpy = vi
        .spyOn(fs, 'readdir')
        .mockResolvedValueOnce([{ name: 'tasklist.yaml', isDirectory: () => false, isFile: () => true }])
      const readFileSpy = vi.spyOn(fs, 'readFile').mockResolvedValueOnce(`
tasklist:
  id: example
  title: Example title
`)

      await expect(formsService()).resolves.toBeDefined()

      expect(mockError).not.toHaveBeenCalled()

      readFileSpy.mockRestore()
      readdirSpy.mockRestore()
    })

    test('logs error when YAML parsing fails', async () => {
      const readdirSpy = vi
        .spyOn(fs, 'readdir')
        .mockResolvedValueOnce([{ name: 'bad.yaml', isDirectory: () => false, isFile: () => true }])
      const readFileSpy = vi.spyOn(fs, 'readFile').mockRejectedValueOnce(new Error('YAML read error'))

      await expect(formsService()).resolves.toBeDefined()

      expect(mockError).toHaveBeenCalled()
      expect(mockError.mock.calls[0][0]).toContain('Failed to parse YAML form')

      readFileSpy.mockRestore()
      readdirSpy.mockRestore()
    })
  })

  describe('validateWhitelistConfiguration', () => {
    const testForm = { title: 'Test Form' }

    test('throws error when only CRN environment variable is provided', () => {
      const definition = {
        metadata: {
          whitelistCrnEnvVar: 'EXAMPLE_WHITELIST_CRNS'
        }
      }

      expect(() => validateWhitelistConfiguration(testForm, definition)).toThrow(
        'Incomplete whitelist configuration in form Test Form: whitelistCrnEnvVar is defined but whitelistSbiEnvVar is missing. Both CRN and SBI whitelist variables must be configured together.'
      )
    })

    test('throws error when only SBI environment variable is provided', () => {
      const definition = {
        metadata: {
          whitelistSbiEnvVar: 'EXAMPLE_WHITELIST_SBIS'
        }
      }

      expect(() => validateWhitelistConfiguration(testForm, definition)).toThrow(
        'Incomplete whitelist configuration in form Test Form: whitelistSbiEnvVar is defined but whitelistCrnEnvVar is missing. Both CRN and SBI whitelist variables must be configured together.'
      )
    })

    test('throws error when CRN environment variable is missing', () => {
      const definition = {
        metadata: {
          whitelistCrnEnvVar: 'MISSING_CRN_VAR',
          whitelistSbiEnvVar: 'EXAMPLE_WHITELIST_SBIS'
        }
      }

      expect(() => validateWhitelistConfiguration(testForm, definition)).toThrow(
        'CRN whitelist environment variable MISSING_CRN_VAR is defined in form Test Form but not configured in environment'
      )
    })

    test('throws error when SBI environment variable is missing', () => {
      const definition = {
        metadata: {
          whitelistCrnEnvVar: 'EXAMPLE_WHITELIST_CRNS',
          whitelistSbiEnvVar: 'MISSING_SBI_VAR'
        }
      }

      expect(() => validateWhitelistConfiguration(testForm, definition)).toThrow(
        'SBI whitelist environment variable MISSING_SBI_VAR is defined in form Test Form but not configured in environment'
      )
    })
  })

  describe('startup configuration validation', () => {
    const testForm = { title: 'Test Form' }

    test('throws error if redirect rules are missing required properties in preSubmission', async () => {
      const badDefinition = {
        metadata: {
          grantRedirectRules: {
            preSubmission: [{}], // missing toPath
            postSubmission: [
              {
                toPath: '/confirmation',
                fromGrantsStatus: 'SUBMITTED',
                gasStatus: 'RECEIVED',
                toGrantsStatus: 'SUBMITTED'
              }
            ]
          }
        }
      }

      expect(() => validateGrantRedirectRules(testForm, badDefinition)).toThrow(
        'Invalid redirect rules in form Test Form: "[0].toPath" is required'
      )
    })

    test('throws error if redirect rules are missing required properties in postSubmission', async () => {
      const badDefinition = {
        metadata: {
          grantRedirectRules: {
            preSubmission: [
              {
                toPath: '/summary'
              }
            ],
            postSubmission: [
              {
                // Missing required toPath
                fromGrantsStatus: 'SUBMITTED',
                gasStatus: 'RECEIVED',
                toGrantsStatus: 'SUBMITTED'
              }
            ]
          }
        }
      }

      expect(() => validateGrantRedirectRules(testForm, badDefinition)).toThrow(
        'Invalid redirect rules in form Test Form: "[0].toPath" is required'
      )
    })

    test('does throw if redirect rules are missing required fallback rule in postSubmission', async () => {
      const badDefinition = {
        metadata: {
          grantRedirectRules: {
            preSubmission: [{ toPath: '/start' }],
            postSubmission: [
              {
                fromGrantsStatus: 'SUBMITTED',
                gasStatus: 'RECEIVED',
                toGrantsStatus: 'SUBMITTED',
                toPath: '/confirmation'
              }
            ]
          }
        }
      }

      expect(() => validateGrantRedirectRules(testForm, badDefinition)).toThrow(
        'Invalid redirect configuration in form Test Form: missing default/default fallback rule in postSubmission'
      )
    })

    test('does not throw when all redirect rules are valid', async () => {
      const goodDefinition = {
        metadata: {
          grantRedirectRules: {
            preSubmission: [{ toPath: '/start' }],
            postSubmission: [
              {
                fromGrantsStatus: 'SUBMITTED',
                gasStatus: 'RECEIVED',
                toGrantsStatus: 'SUBMITTED',
                toPath: '/confirmation'
              },
              {
                fromGrantsStatus: 'default',
                gasStatus: 'default',
                toGrantsStatus: 'default',
                toPath: '/default-redirect'
              }
            ]
          }
        }
      }

      expect(() => validateGrantRedirectRules(testForm, goodDefinition)).not.toThrow()
    })
  })

  describe('formsService error handling', () => {
    test('throws error during startup when whitelist validation fails', async () => {
      delete mockEnv.EXAMPLE_WHITELIST_CRNS

      await expect(formsService()).rejects.toThrow(
        'CRN whitelist environment variable EXAMPLE_WHITELIST_CRNS is defined in form Example Whitelist but not configured in environment'
      )

      mockEnv.EXAMPLE_WHITELIST_CRNS = '1101009926 1101010029'
    })
  })
})
