import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { addAllForms, configureFormDefinition, formsService, validateGrantRedirectRules } from './form.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'
import {
  currentRequest,
  getStateWithDefinition
} from '~/src/server/common/helpers/state/state-with-definition-context.js'
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
  serviceVersion: '1.0.0',
  'forms.backendAllowlistEnabledSlugs': [],
  'forms.backendFormDefEnabledSlugs': []
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
    title: 'Form 3'
  }
]

const UNIQUE_FORMS_ARRAY = TEST_FORMS_ARRAY.slice(0, 2)

// Stateful in-memory stores so formsService() startup writes are visible to later reads
const _metaStore = new Map()
const _reverseStore = new Map()

vi.mock('~/src/server/common/helpers/state/state-with-definition-context.js', () => ({
  currentRequest: vi.fn(),
  getStateWithDefinition: vi.fn(),
  resolveVersion: vi.fn((body) => {
    if (body?.upgraded && body.toVersion) {
      return body.toVersion
    }
    if (body?.state?.grantVersion) {
      return body.state.grantVersion
    }
    const definition = body?.definition
    return definition && definition.major != null
      ? `${definition.major}.${definition.minor}.${definition.patch}`
      : undefined
  })
}))

vi.mock('./forms-redis.js', () => ({
  getFormsRedisClient: vi.fn(() => ({ status: 'ready' })),
  setFormMeta: vi.fn(async (_r, slug, entry) => {
    _metaStore.set(slug, entry)
  }),
  setSlugReverse: vi.fn(async (_r, id, slug) => {
    _reverseStore.set(id, slug)
  }),
  setAllSlugs: vi.fn().mockResolvedValue(undefined),
  getFormMeta: vi.fn(async (_r, slug) => _metaStore.get(slug) ?? null),
  getSlugByFormId: vi.fn(async (_r, id) => _reverseStore.get(id) ?? null)
}))

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

vi.mock('../config.js', () => ({
  metadata: {
    organisation: 'Test Org',
    teamName: 'Test Team',
    teamEmail: 'test@example.com'
  }
}))

const BACKEND_FORM_META = { id: 'backend-form', slug: 'backend-form', title: 'backend-form', source: 'backend' }

// Registers a backend-sourced form in the in-memory meta store.
const registerBackendForm = () => _metaStore.set('backend-form', { ...BACKEND_FORM_META })

// Activates a request context and returns the request used as the backend stash key.
const mockBackendRequest = () => {
  const request = { app: {} }
  vi.mocked(currentRequest).mockReturnValue(request)
  return request
}

// Stubs the backend state-with-definition fetch with the given envelope.
const mockBackendStateWithDefinition = (envelope) => vi.mocked(getStateWithDefinition).mockResolvedValue(envelope)

describe('form', () => {
  let mockWarn, mockError

  beforeEach(() => {
    vi.clearAllMocks()
    _metaStore.clear()
    _reverseStore.clear()
    config.get.mockImplementation((key) => DEFAULT_CONFIG_MOCK[key])
    // Get the warn function from the mocked logger
    mockWarn = logger.warn
    mockError = logger.error
  })

  afterEach(() => {})

  describe('formsService', () => {
    test('returns landGrantsDefinition for matching id', async () => {
      const service = await formsService()
      const result = service.getFormDefinition('5c67688f-3c61-4839-a6e1-d48b598257f1')
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

    test('getFormMetadata returns backend definition metadata for backend-sourced form', async () => {
      registerBackendForm()
      mockBackendRequest()
      mockBackendStateWithDefinition({
        definition: { definition: { name: 'Backend Form', metadata: { foo: 'bar' }, pages: [] } }
      })

      const service = await formsService()
      const result = await service.getFormMetadata('backend-form')

      expect(result).toMatchObject({
        id: 'backend-form',
        slug: 'backend-form',
        title: 'Backend Form'
      })
    })

    test('getFormMetadata stamps the backend updatedAt so the model cache invalidates across versions', async () => {
      registerBackendForm()
      mockBackendRequest()

      const service = await formsService()

      mockBackendStateWithDefinition({
        definition: {
          major: 1,
          minor: 0,
          patch: 1,
          status: 'active',
          updatedAt: '2024-01-01T00:00:00.000Z',
          definition: { name: 'Backend Form', metadata: {}, pages: [] }
        }
      })
      const v101 = await service.getFormMetadata('backend-form')

      mockBackendStateWithDefinition({
        definition: {
          major: 2,
          minor: 1,
          patch: 0,
          status: 'active',
          updatedAt: '2024-06-01T00:00:00.000Z',
          definition: { name: 'Backend Form', metadata: {}, pages: [] }
        }
      })
      const v210 = await service.getFormMetadata('backend-form')

      // `updatedAt` is the real backend timestamp, distinct across versions.
      expect(v101.live.updatedAt).toBeInstanceOf(Date)
      expect(v101.live.updatedAt.getTime()).toBe(new Date('2024-01-01T00:00:00.000Z').getTime())
      expect(v101.live.updatedAt.getTime()).not.toBe(v210.live.updatedAt.getTime())
      expect(v210.metadata.version).toBe('2.1.0')
      // An active form populates `live` and clears `draft`.
      expect(v210.draft).toBeUndefined()
    })

    test('getFormMetadata maps a draft backend status to the draft state and clears live', async () => {
      registerBackendForm()
      mockBackendRequest()

      const service = await formsService()

      mockBackendStateWithDefinition({
        definition: {
          major: 1,
          minor: 0,
          patch: 0,
          status: 'draft',
          updatedAt: '2024-02-02T00:00:00.000Z',
          definition: { name: 'Backend Form', metadata: {}, pages: [] }
        }
      })
      const result = await service.getFormMetadata('backend-form')

      expect(result.live).toBeUndefined()
      expect(result.draft.updatedAt).toBeInstanceOf(Date)
      expect(result.draft.updatedAt.getTime()).toBe(new Date('2024-02-02T00:00:00.000Z').getTime())
    })

    test('getFormDefinition returns the stashed definition for backend-sourced form', async () => {
      registerBackendForm()
      _reverseStore.set('backend-form', 'backend-form')
      const request = mockBackendRequest()
      mockBackendStateWithDefinition({
        definition: { definition: { name: 'Backend Form', pages: [] } }
      })

      const service = await formsService()
      const result = await service.getFormDefinition('backend-form')

      expect(getStateWithDefinition).toHaveBeenCalledWith(request)
      expect(result).toMatchObject({ name: 'Backend Form' })
    })

    test('getFormDefinition merges shared redirect rules into a backend-sourced form with grantRedirectRules: null', async () => {
      registerBackendForm()
      _reverseStore.set('backend-form', 'backend-form')
      mockBackendRequest()
      mockBackendStateWithDefinition({
        definition: {
          definition: { name: 'Backend Form', metadata: { grantRedirectRules: null }, pages: [] }
        }
      })

      const service = await formsService()
      const result = await service.getFormDefinition('backend-form')

      expect(result.metadata.grantRedirectRules).not.toBeNull()
      expect(result.metadata.grantRedirectRules.preSubmission).toEqual([{ toPath: '/summary' }])
      expect(result.metadata.grantRedirectRules.postSubmission.length).toBeGreaterThan(0)
    })

    test('getFormDefinition merges shared redirect rules into a backend-sourced form with no metadata at all', async () => {
      registerBackendForm()
      _reverseStore.set('backend-form', 'backend-form')
      mockBackendRequest()
      mockBackendStateWithDefinition({
        definition: {
          definition: { name: 'Backend Form', pages: [] }
        }
      })

      const service = await formsService()
      const result = await service.getFormDefinition('backend-form')

      expect(result.metadata.grantRedirectRules.preSubmission).toEqual([{ toPath: '/summary' }])
    })

    test('getFormDefinition lets a backend-sourced form override preSubmission while keeping shared postSubmission', async () => {
      registerBackendForm()
      _reverseStore.set('backend-form', 'backend-form')
      mockBackendRequest()
      mockBackendStateWithDefinition({
        definition: {
          definition: {
            name: 'Backend Form',
            metadata: { grantRedirectRules: { preSubmission: [{ toPath: '/custom' }] } },
            pages: []
          }
        }
      })

      const service = await formsService()
      const result = await service.getFormDefinition('backend-form')

      expect(result.metadata.grantRedirectRules.preSubmission).toEqual([{ toPath: '/custom' }])
      expect(result.metadata.grantRedirectRules.postSubmission.length).toBeGreaterThan(0)
    })

    test('getFormMetadata merges shared redirect rules for backend-sourced forms', async () => {
      registerBackendForm()
      mockBackendRequest()
      mockBackendStateWithDefinition({
        definition: {
          definition: { name: 'Backend Form', metadata: { grantRedirectRules: null }, pages: [] }
        }
      })

      const service = await formsService()
      const result = await service.getFormMetadata('backend-form')

      expect(result.metadata.grantRedirectRules.preSubmission).toEqual([{ toPath: '/summary' }])
    })

    test('getFormDefinitionBySlug merges shared redirect rules for backend-sourced forms', async () => {
      mockBackendRequest()
      mockBackendStateWithDefinition({
        definition: {
          definition: { name: 'Backend Form', metadata: { grantRedirectRules: null }, pages: [] }
        }
      })

      const service = await formsService()
      const result = await service.getFormDefinitionBySlug('backend-form')

      expect(result.metadata.grantRedirectRules.preSubmission).toEqual([{ toPath: '/summary' }])
    })

    test('getFormDefinitionBySlug resolves the stashed definition for backend forms', async () => {
      mockBackendRequest()
      mockBackendStateWithDefinition({
        definition: { definition: { name: 'Backend Form', pages: [] } }
      })

      const service = await formsService()
      const result = await service.getFormDefinitionBySlug('backend-form')

      expect(result).toMatchObject({ name: 'Backend Form' })
    })

    test('getFormDefinitionBySlug throws clearly when no request context is active', async () => {
      vi.mocked(currentRequest).mockReturnValue(undefined)

      const service = await formsService()

      await expect(service.getFormDefinitionBySlug('backend-form')).rejects.toThrow(/No request context/)
    })

    test('registers backend slugs with source "backend" when configured', async () => {
      config.get.mockImplementation((key) =>
        key === 'forms.backendFormDefEnabledSlugs' ? ['backend-slug'] : DEFAULT_CONFIG_MOCK[key]
      )

      await formsService()

      expect(_metaStore.get('backend-slug')).toMatchObject({ slug: 'backend-slug', source: 'backend' })
    })
  })

  describe('configureFormDefinition', () => {
    test('configures URLs correctly for non-local environment', () => {
      config.get.mockImplementation((key) => (key === 'cdpEnvironment' ? 'dev' : DEFAULT_CONFIG_MOCK[key]))

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

    test('logs warning for local environment with onLoad URL', () => {
      config.get.mockImplementation((key) => (key === 'cdpEnvironment' ? 'local' : DEFAULT_CONFIG_MOCK[key]))

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
      expect(mockWarn).toHaveBeenCalledWith('Unexpected environment value: local')
      expect(result.pages[0].events.onLoad.options.url).toBe('http://cdpEnvironment.example.com')
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

    test('handles form definition with multiple pages in non-local environment', () => {
      config.get.mockImplementation((key) => (key === 'cdpEnvironment' ? 'dev' : DEFAULT_CONFIG_MOCK[key]))

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
        expect(page.events.onLoad.options.url).toBe('http://dev.example.com')
      })
    })

    test('does not log warning when events exist but no onLoad URL is present', () => {
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

      expect(mockWarn).not.toHaveBeenCalled()
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
          title: 'Form 3'
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

      expect(mockError).not.toHaveBeenCalled()

      readdirSpy.mockRestore()
    })

    test('logs error when reading forms directory fails', async () => {
      const readdirSpy = vi.spyOn(fs, 'readdir').mockRejectedValueOnce(new Error('read error'))

      await expect(formsService()).resolves.toBeDefined()

      expect(mockError).toHaveBeenCalled()
      expect(mockError.mock.calls[0][0]).toContain('Failed to read forms directory')

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

  describe('startup configuration validation', () => {
    const testForm = { title: 'Test Form' }
    const validPostRule = {
      fromGrantsStatus: 'SUBMITTED',
      gasStatus: 'RECEIVED',
      toGrantsStatus: 'SUBMITTED',
      toPath: '/confirmation'
    }
    const defaultFallbackRule = {
      fromGrantsStatus: 'default',
      gasStatus: 'default',
      toGrantsStatus: 'default',
      toPath: '/default-redirect'
    }

    test.each([
      [
        'preSubmission rule is missing toPath',
        { preSubmission: [{}], postSubmission: [validPostRule] },
        'Invalid redirect rules in form Test Form: "[0].toPath" is required'
      ],
      [
        'postSubmission rule is missing toPath',
        {
          preSubmission: [{ toPath: '/summary' }],
          postSubmission: [{ fromGrantsStatus: 'SUBMITTED', gasStatus: 'RECEIVED', toGrantsStatus: 'SUBMITTED' }]
        },
        'Invalid redirect rules in form Test Form: "[0].toPath" is required'
      ],
      [
        'postSubmission is missing the default/default fallback rule',
        { preSubmission: [{ toPath: '/start' }], postSubmission: [validPostRule] },
        'Invalid redirect configuration in form Test Form: missing default/default fallback rule in postSubmission'
      ],
      [
        'postSubmission array is empty',
        { preSubmission: [{ toPath: '/start' }], postSubmission: [] },
        'Invalid redirect configuration in form Test Form: no postSubmission redirect rules defined'
      ]
    ])('throws when %s', (_name, grantRedirectRules, expectedError) => {
      expect(() => validateGrantRedirectRules(testForm, { metadata: { grantRedirectRules } })).toThrow(expectedError)
    })

    test('does not throw when all redirect rules are valid', () => {
      const goodDefinition = {
        metadata: {
          grantRedirectRules: {
            preSubmission: [{ toPath: '/start' }],
            postSubmission: [validPostRule, defaultFallbackRule]
          }
        }
      }

      expect(() => validateGrantRedirectRules(testForm, goodDefinition)).not.toThrow()
    })
  })
})
