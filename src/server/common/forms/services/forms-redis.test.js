import { describe, test, expect, beforeEach, vi } from 'vitest'
import {
  _setFormsRedisClient,
  closeFormsRedisClient,
  getFormsRedisClient,
  setFormMeta,
  getFormMeta,
  registerSlug,
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
    mockRedis = { get: vi.fn(), set: vi.fn(), sadd: vi.fn(), smembers: vi.fn() }
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

  describe('registerSlug / getAllSlugs', () => {
    test('adds the slug to the slug-index set', async () => {
      mockRedis.sadd.mockResolvedValue(1)

      await registerSlug(mockRedis, 'my-form')

      expect(mockRedis.sadd).toHaveBeenCalledWith('forms:slug-index', 'my-form')
    })

    test('is idempotent: re-registering an existing slug is a plain SADD (no read-modify-write)', async () => {
      mockRedis.sadd.mockResolvedValue(0)

      await registerSlug(mockRedis, 'my-form')
      await registerSlug(mockRedis, 'my-form')

      expect(mockRedis.sadd).toHaveBeenCalledTimes(2)
      expect(mockRedis.get).not.toHaveBeenCalled()
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    test('retrieves the slug set sorted', async () => {
      mockRedis.smembers.mockResolvedValue(['form-b', 'form-a'])

      const result = await getAllSlugs(mockRedis)

      expect(mockRedis.smembers).toHaveBeenCalledWith('forms:slug-index')
      expect(result).toEqual(['form-a', 'form-b'])
    })

    test('returns empty array when no slugs have been registered', async () => {
      mockRedis.smembers.mockResolvedValue([])

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
    test('returns metas for all registered slugs', async () => {
      const metaA = { id: 'form-a', slug: 'form-a', title: 'Form A', metadata: {}, source: 'backend' }
      const metaB = { id: 'form-b', slug: 'form-b', title: 'Form B', metadata: {}, source: 'backend' }
      mockRedis.smembers.mockResolvedValue(['form-a', 'form-b'])
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(metaA)).mockResolvedValueOnce(JSON.stringify(metaB))

      const result = await getAllFormMetas(mockRedis)

      expect(result).toEqual([metaA, metaB])
    })

    test('filters out null entries for slugs with no metadata', async () => {
      mockRedis.smembers.mockResolvedValue(['form-a', 'missing'])
      mockRedis.get
        .mockResolvedValueOnce(
          JSON.stringify({ id: 'form-a', slug: 'form-a', title: 'Form A', metadata: {}, source: 'backend' })
        )
        .mockResolvedValueOnce(null)

      const result = await getAllFormMetas(mockRedis)

      expect(result).toHaveLength(1)
      expect(result[0].slug).toBe('form-a')
    })

    test('returns empty array when no slugs are registered', async () => {
      mockRedis.smembers.mockResolvedValue([])

      expect(await getAllFormMetas(mockRedis)).toEqual([])
    })
  })
})
