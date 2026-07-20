import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { configureFormDefinition, formsService } from './form.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'
import {
  currentRequest,
  getStateWithDefinition
} from '~/src/server/common/helpers/state/state-with-definition-context.js'

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

// Activates a request context and returns the request used as the backend stash key.
const mockBackendRequest = () => {
  const request = { app: {} }
  vi.mocked(currentRequest).mockReturnValue(request)
  return request
}

// Stubs the backend state-with-definition fetch with the given envelope.
const mockBackendStateWithDefinition = (envelope) => vi.mocked(getStateWithDefinition).mockResolvedValue(envelope)

describe('form', () => {
  let mockWarn

  beforeEach(() => {
    vi.clearAllMocks()
    config.get.mockImplementation((key) => DEFAULT_CONFIG_MOCK[key])
    mockWarn = logger.warn
  })

  describe('formsService', () => {
    test('getFormDefinition returns the backend-sourced definition for a registered id', async () => {
      mockBackendRequest()
      mockBackendStateWithDefinition({
        definition: { definition: { name: 'Backend Form', pages: [] } }
      })

      const service = await formsService()
      const result = service.getFormDefinition('backend-form')
      await expect(result).resolves.toBeDefined()
    })

    test('throws error for unknown id when no request context is active', async () => {
      vi.mocked(currentRequest).mockReturnValue(undefined)

      const service = await formsService()
      await expect(service.getFormDefinition('unknown-id')).rejects.toThrow(/No request context/)
    })

    test('getFormMetadata registers and resolves a previously unseen slug', async () => {
      mockBackendRequest()
      mockBackendStateWithDefinition({
        definition: { definition: { name: 'Backend Form', pages: [] } }
      })

      const service = await formsService()
      const result = await service.getFormMetadata('new-slug')

      expect(result).toMatchObject({ id: 'new-slug', slug: 'new-slug' })
    })

    test('getFormMetadata throws when the backend has no request context to resolve against', async () => {
      vi.mocked(currentRequest).mockReturnValue(undefined)

      const service = await formsService()

      await expect(service.getFormMetadata('unknown-slug')).rejects.toThrow(/No request context/)
    })

    test('getFormDefinition throws notFound boom error when the backend has no definition for the id', async () => {
      mockBackendRequest()
      mockBackendStateWithDefinition({ definition: undefined })

      const service = await formsService()
      const error = await service.getFormDefinition('unknown-id').catch((e) => e)
      expect(error.isBoom).toBe(true)
      expect(error.output.statusCode).toBe(404)
      expect(error.message).toContain("Form definition for 'unknown-id' not found")
    })

    test('getFormMetadata returns backend definition metadata for backend-sourced form', async () => {
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

    test('getFormDefinition merges shared redirect rules into a backend sourced form with no metadata at all', async () => {
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

    test('getFormMetadata throws notFound when the backend has no definition for the slug', async () => {
      mockBackendRequest()
      mockBackendStateWithDefinition(null)

      const service = await formsService()

      await expect(service.getFormMetadata('mistyped-slug')).rejects.toThrow(/not found/)
    })

    test('getFormMetadata tracks the latest published definition across resolutions', async () => {
      mockBackendRequest()
      const service = await formsService()

      mockBackendStateWithDefinition({
        definition: { definition: { name: 'Old Title', metadata: { supportEmail: 'old@example.com' }, pages: [] } }
      })
      const first = await service.getFormMetadata('backend-slug')
      expect(first.title).toBe('Old Title')

      mockBackendStateWithDefinition({
        definition: { definition: { name: 'New Title', metadata: { supportEmail: 'new@example.com' }, pages: [] } }
      })
      const second = await service.getFormMetadata('backend-slug')
      expect(second.title).toBe('New Title')
      expect(second.metadata).toMatchObject({ supportEmail: 'new@example.com' })
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
})
