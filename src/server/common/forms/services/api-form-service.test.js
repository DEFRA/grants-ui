import { describe, test, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { ApiFormService } from './api-form-service.js'

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-token')
  }
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('./forms-redis.js', () => ({
  getFormDef: vi.fn(),
  setFormDef: vi.fn().mockResolvedValue(undefined),
  setFormMeta: vi.fn().mockResolvedValue(undefined),
  setSlugReverse: vi.fn().mockResolvedValue(undefined)
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('ApiFormService', () => {
  let service

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ApiFormService('https://api.example.com', 'secret', '1h', 300)
  })

  describe('generateJwt', () => {
    test('signs a JWT with the configured secret and expiry', () => {
      const token = service.generateJwt()
      expect(jwt.sign).toHaveBeenCalledWith({}, 'secret', { expiresIn: '1h' })
      expect(token).toBe('mock-token')
    })
  })

  describe('apiFetch', () => {
    test('sends request with Bearer token and returns parsed JSON', async () => {
      const data = { id: 'form-1', slug: 'my-form' }
      mockFetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(data) })

      const result = await service.apiFetch('/forms/slug/my-form')

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/forms/slug/my-form', {
        headers: { Authorization: 'Bearer mock-token' }
      })
      expect(result).toEqual(data)
    })

    test('throws on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' })

      await expect(service.apiFetch('/forms/slug/missing')).rejects.toThrow('Config API request failed: 404 Not Found')
    })

    test('propagates network errors', async () => {
      mockFetch.mockRejectedValue(new Error('network error'))

      await expect(service.apiFetch('/forms/slug/my-form')).rejects.toThrow('network error')
    })
  })

  describe('fetchFormMetadata', () => {
    test('returns a shaped cache entry from the API response', async () => {
      vi.spyOn(service, 'apiFetch').mockResolvedValue({ id: 'api-id', slug: 'my-form', title: 'My Form' })

      const result = await service.fetchFormMetadata('my-form')

      expect(service.apiFetch).toHaveBeenCalledWith('/forms/slug/my-form')
      expect(result).toEqual({ id: 'api-id', slug: 'my-form', title: 'My Form', metadata: {}, source: 'api' })
    })
  })

  describe('fetchFormDefinition', () => {
    test('calls apiFetch with the definition path', async () => {
      const definition = { name: 'my-form', pages: [] }
      vi.spyOn(service, 'apiFetch').mockResolvedValue(definition)

      const result = await service.fetchFormDefinition('my-form')

      expect(service.apiFetch).toHaveBeenCalledWith('/forms/slug/my-form/definition')
      expect(result).toEqual(definition)
    })
  })

  describe('fetchAndCacheDefinition', () => {
    test('fetches, applies configure, writes to Redis, and returns the definition', async () => {
      const rawDef = { name: 'raw', pages: [] }
      const configuredDef = { name: 'configured', pages: [] }
      vi.spyOn(service, 'fetchFormDefinition').mockResolvedValue(rawDef)
      const configure = vi.fn().mockReturnValue(configuredDef)
      const { setFormDef } = await import('./forms-redis.js')

      const result = await service.fetchAndCacheDefinition({}, 'my-form', configure)

      expect(configure).toHaveBeenCalledWith(rawDef)
      expect(setFormDef).toHaveBeenCalledWith({}, 'my-form', configuredDef, 300)
      expect(result).toEqual(configuredDef)
    })
  })

  describe('getFormDefinition', () => {
    test('returns the cached definition when Redis has a hit', async () => {
      const cached = { name: 'cached', pages: [] }
      const { getFormDef } = await import('./forms-redis.js')
      vi.mocked(getFormDef).mockResolvedValue(cached)

      const result = await service.getFormDefinition({}, 'my-form', vi.fn())

      expect(result).toEqual(cached)
    })

    test('fetches and caches when Redis returns null', async () => {
      const { getFormDef } = await import('./forms-redis.js')
      vi.mocked(getFormDef).mockResolvedValue(null)
      const fetched = { name: 'fetched', pages: [] }
      vi.spyOn(service, 'fetchAndCacheDefinition').mockResolvedValue(fetched)
      const configure = vi.fn()

      const result = await service.getFormDefinition({}, 'my-form', configure)

      expect(service.fetchAndCacheDefinition).toHaveBeenCalledWith({}, 'my-form', configure)
      expect(result).toEqual(fetched)
    })
  })

  describe('loadAll', () => {
    test('fetches, validates, and stores each slug successfully', async () => {
      const entry = { id: 'api-id', slug: 'my-form', title: 'My Form', metadata: {}, source: 'api' }
      const definition = { name: 'my-form', metadata: { grantRedirectRules: {} }, pages: [] }
      vi.spyOn(service, 'fetchFormMetadata').mockResolvedValue(entry)
      vi.spyOn(service, 'fetchFormDefinition').mockResolvedValue(definition)
      const configure = vi.fn((d) => d)
      const validateWhitelist = vi.fn()
      const validateRedirect = vi.fn()
      const { setFormMeta, setFormDef, setSlugReverse } = await import('./forms-redis.js')

      await service.loadAll({}, ['my-form'], {}, configure, validateWhitelist, validateRedirect)

      expect(configure).toHaveBeenCalledWith(definition)
      expect(validateWhitelist).toHaveBeenCalledWith({ title: 'My Form' }, definition)
      expect(validateRedirect).toHaveBeenCalledWith({ title: 'My Form' }, definition)
      expect(setFormMeta).toHaveBeenCalledWith({}, 'my-form', entry)
      expect(setFormDef).toHaveBeenCalledWith({}, 'my-form', definition, 300)
      expect(setSlugReverse).toHaveBeenCalledWith({}, 'api-id', 'my-form')
    })

    test('merges shared redirect rules into definition metadata', async () => {
      const entry = { id: 'api-id', slug: 'my-form', title: 'My Form', metadata: {}, source: 'api' }
      const definition = {
        name: 'my-form',
        metadata: { grantRedirectRules: { postSubmission: [{ toPath: '/form-specific' }] } },
        pages: []
      }
      vi.spyOn(service, 'fetchFormMetadata').mockResolvedValue(entry)
      vi.spyOn(service, 'fetchFormDefinition').mockResolvedValue(definition)
      const configure = vi.fn((d) => d)
      const sharedRules = { preSubmission: [{ toPath: '/shared-start' }] }

      await service.loadAll({}, ['my-form'], sharedRules, configure, vi.fn(), vi.fn())

      expect(definition.metadata.grantRedirectRules).toMatchObject({
        preSubmission: [{ toPath: '/shared-start' }],
        postSubmission: [{ toPath: '/form-specific' }]
      })
    })

    test('carries definition metadata into the cache entry', async () => {
      const entry = { id: 'api-id', slug: 'my-form', title: 'My Form', metadata: {}, source: 'api' }
      const definition = { name: 'my-form', metadata: { whitelistCrnEnvVar: 'SOME_VAR' }, pages: [] }
      vi.spyOn(service, 'fetchFormMetadata').mockResolvedValue(entry)
      vi.spyOn(service, 'fetchFormDefinition').mockResolvedValue(definition)
      const { setFormMeta } = await import('./forms-redis.js')

      await service.loadAll(
        {},
        ['my-form'],
        {},
        vi.fn((d) => d),
        vi.fn(),
        vi.fn()
      )

      expect(setFormMeta).toHaveBeenCalledWith(
        {},
        'my-form',
        expect.objectContaining({ metadata: expect.objectContaining({ whitelistCrnEnvVar: 'SOME_VAR' }) })
      )
    })

    test('does nothing when slugs array is empty', async () => {
      vi.spyOn(service, 'fetchFormMetadata')

      await service.loadAll({}, [], {}, vi.fn(), vi.fn(), vi.fn())

      expect(service.fetchFormMetadata).not.toHaveBeenCalled()
    })

    test('throws and logs when a fetch fails', async () => {
      vi.spyOn(service, 'fetchFormMetadata').mockRejectedValue(new Error('API unavailable'))
      vi.spyOn(service, 'fetchFormDefinition').mockRejectedValue(new Error('API unavailable'))
      const { logger } = await import('~/src/server/common/helpers/logging/log.js')

      await expect(service.loadAll({}, ['bad-form'], {}, vi.fn(), vi.fn(), vi.fn())).rejects.toThrow('API unavailable')
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load API form "bad-form"'))
    })

    test('throws and logs when validation fails', async () => {
      const entry = { id: 'api-id', slug: 'my-form', title: 'My Form', metadata: {}, source: 'api' }
      const definition = { name: 'my-form', metadata: {}, pages: [] }
      vi.spyOn(service, 'fetchFormMetadata').mockResolvedValue(entry)
      vi.spyOn(service, 'fetchFormDefinition').mockResolvedValue(definition)
      const validateRedirect = vi.fn().mockImplementation(() => {
        throw new Error('invalid redirect rules')
      })
      const { logger } = await import('~/src/server/common/helpers/logging/log.js')

      await expect(
        service.loadAll(
          {},
          ['my-form'],
          {},
          vi.fn((d) => d),
          vi.fn(),
          validateRedirect
        )
      ).rejects.toThrow('invalid redirect rules')
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load API form "my-form"'))
    })

    test('processes multiple slugs in sequence', async () => {
      const makeEntry = (slug) => ({ id: `id-${slug}`, slug, title: slug, metadata: {}, source: 'api' })
      const makeDef = () => ({ name: 'form', metadata: {}, pages: [] })
      vi.spyOn(service, 'fetchFormMetadata').mockImplementation(async (slug) => makeEntry(slug))
      vi.spyOn(service, 'fetchFormDefinition').mockResolvedValue(makeDef())
      const { setFormMeta } = await import('./forms-redis.js')

      await service.loadAll(
        {},
        ['form-a', 'form-b'],
        {},
        vi.fn((d) => d),
        vi.fn(),
        vi.fn()
      )

      expect(setFormMeta).toHaveBeenCalledTimes(2)
    })
  })
})
