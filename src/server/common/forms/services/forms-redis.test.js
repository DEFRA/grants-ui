import { describe, test, expect, beforeEach, vi } from 'vitest'
import {
  _setFormsRedisClient,
  closeFormsRedisClient,
  getFormsRedisClient,
  setFormMeta,
  getFormMeta,
  setFormDef,
  getFormDef,
  setSlugReverse,
  getSlugByFormId,
  setAllSlugs,
  getAllSlugs,
  getAllFormMetas
} from './forms-redis.js'

vi.mock('~/src/server/common/helpers/redis-client.js', () => ({
  buildRedisClient: vi.fn()
}))

vi.mock('~/src/config/config.js', async () => {
  const { mockConfig } = await import('~/src/__mocks__')
  return mockConfig({ redis: {} })
})

describe('forms-redis', () => {
  let mockRedis

  beforeEach(() => {
    vi.clearAllMocks()
    mockRedis = { get: vi.fn(), set: vi.fn() }
    _setFormsRedisClient(mockRedis)
  })

  describe('getFormsRedisClient', () => {
    test('returns the injected client', () => {
      expect(getFormsRedisClient()).toBe(mockRedis)
    })

    test('builds and caches a new client when none is set', async () => {
      _setFormsRedisClient(null)
      const { buildRedisClient } = await import('~/src/server/common/helpers/redis-client.js')
      const builtClient = { get: vi.fn(), set: vi.fn() }
      vi.mocked(buildRedisClient).mockReturnValue(builtClient)

      const first = getFormsRedisClient()
      const second = getFormsRedisClient()

      expect(buildRedisClient).toHaveBeenCalledTimes(1)
      expect(first).toBe(builtClient)
      expect(second).toBe(builtClient)

      _setFormsRedisClient(mockRedis)
    })
  })

  describe('setFormMeta / getFormMeta', () => {
    test('stores entry as JSON under the meta key', async () => {
      const entry = { id: 'form-1', slug: 'my-form', title: 'My Form', metadata: {}, source: 'yaml' }
      mockRedis.set.mockResolvedValue('OK')

      await setFormMeta(mockRedis, 'my-form', entry)

      expect(mockRedis.set).toHaveBeenCalledWith('forms:meta:my-form', JSON.stringify(entry))
    })

    test('retrieves and parses stored entry', async () => {
      const entry = { id: 'form-1', slug: 'my-form', title: 'My Form', metadata: {}, source: 'yaml' }
      mockRedis.get.mockResolvedValue(JSON.stringify(entry))

      const result = await getFormMeta(mockRedis, 'my-form')

      expect(mockRedis.get).toHaveBeenCalledWith('forms:meta:my-form')
      expect(result).toEqual(entry)
    })

    test('returns null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null)

      expect(await getFormMeta(mockRedis, 'missing')).toBeNull()
    })
  })

  describe('setFormDef / getFormDef', () => {
    test('stores definition with EX TTL when ttlSeconds is provided', async () => {
      const def = { name: 'my-form', pages: [] }
      mockRedis.set.mockResolvedValue('OK')

      await setFormDef(mockRedis, 'my-form', def, 300)

      expect(mockRedis.set).toHaveBeenCalledWith('forms:def:my-form', JSON.stringify(def), 'EX', 300)
    })

    test('stores definition without TTL when ttlSeconds is omitted', async () => {
      const def = { name: 'my-form', pages: [] }
      mockRedis.set.mockResolvedValue('OK')

      await setFormDef(mockRedis, 'my-form', def)

      expect(mockRedis.set).toHaveBeenCalledWith('forms:def:my-form', JSON.stringify(def))
    })

    test('retrieves and parses cached definition', async () => {
      const def = { name: 'my-form', pages: [] }
      mockRedis.get.mockResolvedValue(JSON.stringify(def))

      const result = await getFormDef(mockRedis, 'my-form')

      expect(mockRedis.get).toHaveBeenCalledWith('forms:def:my-form')
      expect(result).toEqual(def)
    })

    test('returns null when definition is not cached', async () => {
      mockRedis.get.mockResolvedValue(null)

      expect(await getFormDef(mockRedis, 'missing')).toBeNull()
    })
  })

  describe('setSlugReverse / getSlugByFormId', () => {
    test('stores slug under the reverse key for the given id', async () => {
      mockRedis.set.mockResolvedValue('OK')

      await setSlugReverse(mockRedis, 'form-id-1', 'my-form')

      expect(mockRedis.set).toHaveBeenCalledWith('forms:reverse:form-id-1', 'my-form')
    })

    test('retrieves the slug for a given form id', async () => {
      mockRedis.get.mockResolvedValue('my-form')

      const result = await getSlugByFormId(mockRedis, 'form-id-1')

      expect(mockRedis.get).toHaveBeenCalledWith('forms:reverse:form-id-1')
      expect(result).toBe('my-form')
    })

    test('returns null when form id has no reverse mapping', async () => {
      mockRedis.get.mockResolvedValue(null)

      expect(await getSlugByFormId(mockRedis, 'unknown-id')).toBeNull()
    })
  })

  describe('setAllSlugs / getAllSlugs', () => {
    test('stores slug list as JSON', async () => {
      const slugs = ['form-a', 'form-b', 'form-c']
      mockRedis.set.mockResolvedValue('OK')

      await setAllSlugs(mockRedis, slugs)

      expect(mockRedis.set).toHaveBeenCalledWith('forms:slugs', JSON.stringify(slugs))
    })

    test('retrieves and parses slug list', async () => {
      const slugs = ['form-a', 'form-b']
      mockRedis.get.mockResolvedValue(JSON.stringify(slugs))

      const result = await getAllSlugs(mockRedis)

      expect(mockRedis.get).toHaveBeenCalledWith('forms:slugs')
      expect(result).toEqual(slugs)
    })

    test('returns empty array when no slugs have been stored', async () => {
      mockRedis.get.mockResolvedValue(null)

      expect(await getAllSlugs(mockRedis)).toEqual([])
    })
  })

  describe('closeFormsRedisClient', () => {
    test('calls quit() on the active client', async () => {
      const quit = vi.fn().mockResolvedValue('OK')
      mockRedis.quit = quit

      await closeFormsRedisClient()

      expect(quit).toHaveBeenCalledTimes(1)
    })

    test('nulls the singleton so the next getFormsRedisClient rebuilds it', async () => {
      mockRedis.quit = vi.fn().mockResolvedValue('OK')
      const { buildRedisClient } = await import('~/src/server/common/helpers/redis-client.js')
      const newClient = { get: vi.fn(), set: vi.fn(), quit: vi.fn() }
      vi.mocked(buildRedisClient).mockReturnValueOnce(newClient)

      await closeFormsRedisClient()

      expect(getFormsRedisClient()).toBe(newClient)
      _setFormsRedisClient(mockRedis) // restore for subsequent tests
    })

    test('is a no-op when no client is set', async () => {
      _setFormsRedisClient(null)
      await expect(closeFormsRedisClient()).resolves.toBeUndefined()
    })
  })

  describe('getAllFormMetas', () => {
    test('returns metas for all stored slugs', async () => {
      const slugs = ['form-a', 'form-b']
      const metaA = { id: 'id-a', slug: 'form-a', title: 'Form A', metadata: {}, source: 'yaml' }
      const metaB = { id: 'id-b', slug: 'form-b', title: 'Form B', metadata: {}, source: 'api' }
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(slugs))
        .mockResolvedValueOnce(JSON.stringify(metaA))
        .mockResolvedValueOnce(JSON.stringify(metaB))

      const result = await getAllFormMetas(mockRedis)

      expect(result).toEqual([metaA, metaB])
    })

    test('filters out null entries for slugs with no metadata', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(['form-a', 'missing']))
        .mockResolvedValueOnce(
          JSON.stringify({ id: 'id-a', slug: 'form-a', title: 'Form A', metadata: {}, source: 'yaml' })
        )
        .mockResolvedValueOnce(null)

      const result = await getAllFormMetas(mockRedis)

      expect(result).toHaveLength(1)
      expect(result[0].slug).toBe('form-a')
    })

    test('returns empty array when no slugs are stored', async () => {
      mockRedis.get.mockResolvedValue(null)

      expect(await getAllFormMetas(mockRedis)).toEqual([])
    })
  })
})
