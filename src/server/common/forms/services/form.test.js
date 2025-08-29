import { config } from '~/src/config/config.js'
import { configureFormDefinition, formsService, addAllForms, validateWhitelistConfiguration } from './form.js'

const mockUrl = { pathname: '/mock/path' }
global.URL = jest.fn(() => mockUrl)
global.import = { meta: { url: 'file:///mock/path' } }

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

const mockWarn = jest.fn()
const mockInfo = jest.fn()
const mockError = jest.fn()
jest.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: jest.fn(() => ({
    warn: mockWarn,
    info: mockInfo,
    error: mockError,
    debug: jest.fn()
  }))
}))

jest.mock('../config.js', () => ({
  metadata: {
    organisation: 'Test Org',
    teamName: 'Test Team',
    teamEmail: 'test@example.com'
  }
}))

jest.mock('./forms-config.js', () => ({
  allForms: [
    {
      path: 'src/server/common/forms/definitions/test-form.yaml',
      id: 'test-form-id',
      slug: 'test-form',
      title: 'Test Form'
    },
    {
      path: 'src/server/common/forms/definitions/test-form-with-whitelist.yaml',
      id: 'test-form-with-whitelist-id',
      slug: 'test-form-with-whitelist',
      title: 'Test Form with Whitelist'
    }
  ]
}))

const mockGetFormDefinition = jest.fn()
const mockAddForm = jest.fn()
const mockToFormsService = jest.fn()

jest.mock('@defra/forms-engine-plugin/file-form-service.js', () => ({
  FileFormService: jest.fn().mockImplementation(() => ({
    getFormDefinition: mockGetFormDefinition,
    addForm: mockAddForm,
    toFormsService: mockToFormsService
  }))
}))

describe('form', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    config.get.mockImplementation((key) => defaultConfigMock[key])
    mockGetFormDefinition.mockReset()
    mockAddForm.mockResolvedValue(undefined)
    mockToFormsService.mockReturnValue({
      getFormDefinition: jest.fn()
    })
    delete process.env.TEST_CRN_WHITELIST
    delete process.env.TEST_SBI_WHITELIST
  })

  describe('formsService', () => {
    test('returns exampleGrantDefinition for matching id', async () => {
      mockGetFormDefinition.mockReturnValue({ metadata: {} })
      mockToFormsService.mockReturnValue({
        getFormDefinition: mockGetFormDefinition
      })
      const service = await formsService()
      const result = service.getFormDefinition('5eeb9f71-44f8-46ed-9412-3d5e2c5ab2bc')
      expect(result).toBeDefined()
    })

    test('returns landGrantsDefinition for matching id', async () => {
      mockGetFormDefinition.mockReturnValue({ metadata: {} })
      mockToFormsService.mockReturnValue({
        getFormDefinition: mockGetFormDefinition
      })
      const service = await formsService()
      const result = service.getFormDefinition('5c67688f-3c61-4839-a6e1-d48b598257f1')
      expect(result).toBeDefined()
    })

    test('returns addingValueDefinition for matching id', async () => {
      mockGetFormDefinition.mockReturnValue({ metadata: {} })
      mockToFormsService.mockReturnValue({
        getFormDefinition: mockGetFormDefinition
      })
      const service = await formsService()
      const result = service.getFormDefinition('95e92559-968d-44ae-8666-2b1ad3dffd31')
      expect(result).toBeDefined()
    })

    test('throws error for unknown id', async () => {
      mockGetFormDefinition.mockImplementation((id) => {
        if (id === 'unknown-id') throw new Error('Unknown form ID')
        return { metadata: {} }
      })
      mockToFormsService.mockReturnValue({
        getFormDefinition: mockGetFormDefinition
      })
      const service = await formsService()
      expect(() => service.getFormDefinition('unknown-id')).toThrow()
    })
  })

  describe('configureFormDefinition', () => {
    test('configures URLs correctly for local environment', () => {
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
      expect(result.pages[0].events.onLoad.options.url).toBe(
        'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
      )
    })

    test('configures URLs correctly for non-local environment', () => {
      // Override the config mock for this test only
      config.get.mockImplementation((key) => (key === 'cdpEnvironment' ? 'dev' : defaultConfigMock[key]))

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
      expect(result.pages[0].events.onLoad.options.url).toBe('http://dev.example.com')
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
          'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
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

      expect(mockWarn).toHaveBeenCalledWith(`Unexpected environment value: ${defaultConfigMock.cdpEnvironment}`)

      expect(result).toEqual(definition)
    })
  })

  describe('addAllForms', () => {
    test('handles duplicate forms and logs warning', async () => {
      const mockLoader = {
        addForm: jest.fn().mockResolvedValue(undefined)
      }

      const testForms = [
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
          title: 'Form 3'
        }
      ]

      const result = await addAllForms(mockLoader, testForms)

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
          title: 'Form 3'
        })
      )
    })

    test('handles empty forms array', async () => {
      const mockLoader = {
        addForm: jest.fn()
      }

      const result = await addAllForms(mockLoader, [])

      expect(result).toBe(0)
      expect(mockLoader.addForm).not.toHaveBeenCalled()
      expect(mockWarn).not.toHaveBeenCalled()
    })

    test('handles all unique forms', async () => {
      const mockLoader = {
        addForm: jest.fn().mockResolvedValue(undefined)
      }

      const testForms = [
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

      const result = await addAllForms(mockLoader, testForms)

      expect(result).toBe(2)
      expect(mockLoader.addForm).toHaveBeenCalledTimes(2)
      expect(mockWarn).not.toHaveBeenCalled()
    })
  })

  describe('whitelist validation', () => {
    describe('formsService with whitelist validation', () => {
      test('validates forms without whitelist configuration successfully', async () => {
        mockGetFormDefinition.mockReturnValue({ metadata: {} })

        await formsService()

        expect(mockError).not.toHaveBeenCalled()
        expect(mockInfo).not.toHaveBeenCalled()
      })

      test('validates forms with complete whitelist configuration', async () => {
        process.env.TEST_CRN_WHITELIST = '1101009926 1101010029'
        process.env.TEST_SBI_WHITELIST = '123456789 987654321'

        mockGetFormDefinition.mockReturnValue({
          metadata: {
            whitelistCrnEnvVar: 'TEST_CRN_WHITELIST',
            whitelistSbiEnvVar: 'TEST_SBI_WHITELIST'
          }
        })

        await formsService()

        expect(mockError).not.toHaveBeenCalled()
        expect(mockInfo).toHaveBeenCalledWith('Whitelist configuration validated for form: Test Form')

        delete process.env.TEST_CRN_WHITELIST
        delete process.env.TEST_SBI_WHITELIST
      })

      test.each([
        [
          'missing SBI',
          { whitelistCrnEnvVar: 'TEST_CRN_WHITELIST' },
          'whitelistCrnEnvVar is defined but whitelistSbiEnvVar is missing'
        ],
        [
          'missing CRN',
          { whitelistSbiEnvVar: 'TEST_SBI_WHITELIST' },
          'whitelistSbiEnvVar is defined but whitelistCrnEnvVar is missing'
        ]
      ])('throws error for incomplete whitelist configuration - %s', async (description, metadata, expectedError) => {
        mockGetFormDefinition.mockReturnValue({ metadata })

        await expect(formsService()).rejects.toThrow(
          `Incomplete whitelist configuration in form Test Form: ${expectedError}. Both CRN and SBI whitelist variables must be configured together.`
        )

        expect(mockError).toHaveBeenCalledWith(
          `Whitelist validation failed during startup: Incomplete whitelist configuration in form Test Form: ${expectedError}. Both CRN and SBI whitelist variables must be configured together.`
        )
      })

      test.each([
        ['CRN', 'TEST_SBI_WHITELIST', '123456789 987654321', 'TEST_CRN_WHITELIST'],
        ['SBI', 'TEST_CRN_WHITELIST', '1101009926 1101010029', 'TEST_SBI_WHITELIST']
      ])(
        'throws error when %s environment variable is not configured',
        async (type, envToSet, envValue, missingEnv) => {
          process.env[envToSet] = envValue

          mockGetFormDefinition.mockReturnValue({
            metadata: {
              whitelistCrnEnvVar: 'TEST_CRN_WHITELIST',
              whitelistSbiEnvVar: 'TEST_SBI_WHITELIST'
            }
          })

          await expect(formsService()).rejects.toThrow(
            `${type} whitelist environment variable ${missingEnv} is defined in form Test Form but not configured in environment`
          )

          expect(mockError).toHaveBeenCalledWith(
            `Whitelist validation failed during startup: ${type} whitelist environment variable ${missingEnv} is defined in form Test Form but not configured in environment`
          )

          delete process.env[envToSet]
        }
      )

      test('throws error for incomplete whitelist configuration - missing CRN (covers line 79 branch)', async () => {
        mockGetFormDefinition.mockImplementation((formId) => {
          if (formId === 'test-form-id') {
            return {
              metadata: {
                whitelistSbiEnvVar: 'TEST_SBI_WHITELIST'
              }
            }
          }
          return { metadata: {} }
        })

        await expect(formsService()).rejects.toThrow(
          'Incomplete whitelist configuration in form Test Form: whitelistSbiEnvVar is defined but whitelistCrnEnvVar is missing'
        )
      })
    })

    describe('validateWhitelistConfiguration direct tests', () => {
      test('covers line 79 branch - SBI defined but CRN missing', () => {
        const form = { title: 'Test Form' }
        const definition = {
          metadata: {
            whitelistSbiEnvVar: 'TEST_SBI_WHITELIST'
          }
        }

        expect(() => validateWhitelistConfiguration(form, definition)).toThrow(
          'Incomplete whitelist configuration in form Test Form: whitelistSbiEnvVar is defined but whitelistCrnEnvVar is missing'
        )
      })

      test('validates multiple forms with mixed whitelist configurations', async () => {
        process.env.TEST_CRN_WHITELIST = '1101009926 1101010029'
        process.env.TEST_SBI_WHITELIST = '123456789 987654321'

        mockGetFormDefinition.mockImplementation((formId) => {
          if (formId === 'test-form-id') {
            return { metadata: {} }
          }
          if (formId === 'test-form-with-whitelist-id') {
            return {
              metadata: {
                whitelistCrnEnvVar: 'TEST_CRN_WHITELIST',
                whitelistSbiEnvVar: 'TEST_SBI_WHITELIST'
              }
            }
          }
          return { metadata: {} }
        })

        await formsService()

        expect(mockError).not.toHaveBeenCalled()
        expect(mockInfo).toHaveBeenCalledWith('Whitelist configuration validated for form: Test Form with Whitelist')
        expect(mockInfo).toHaveBeenCalledTimes(1)
      })
    })
  })
})
