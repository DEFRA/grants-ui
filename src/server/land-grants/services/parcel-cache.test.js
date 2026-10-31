import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { debug } from '~/src/server/common/helpers/logging/log.js'
import {
  cachedParcelActions,
  cachedSbiParcels,
  clearParcelCache,
  fetchAuthorisedParcelIds,
  sbiParcelsKey
} from './parcel-cache.js'
import { useCachedMethodServer } from '~/src/server/common/helpers/cache/cached-method.test-helpers.js'
import { parcelCachePlugin } from '~/src/server/land-grants/services/parcel-cache.js'

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchParcelsFromDal: vi.fn()
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  debug: vi.fn(),
  LogCodes: { SYSTEM: { EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR' } }
}))

const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const TTL = 5 * SECONDS_PER_MINUTE * MS_PER_SECOND
const SBI = '800000602'

describe('parcel-cache', () => {
  useCachedMethodServer(parcelCachePlugin)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sbiParcelsKey', () => {
    it('joins the sbi with the sorted fields', () => {
      expect(sbiParcelsKey(SBI, ['size', 'actions'])).toBe(`${SBI}:actions,size`)
    })
  })

  describe.each([
    ['cachedSbiParcels', cachedSbiParcels],
    ['cachedParcelActions', cachedParcelActions]
  ])('%s', (_name, cached) => {
    it('loads on a miss and serves the cached value on a hit', async () => {
      const load = vi.fn().mockResolvedValue({ actions: [] })

      expect(await cached('key', load)).toEqual({ actions: [] })
      expect(await cached('key', load)).toEqual({ actions: [] })
      expect(load).toHaveBeenCalledTimes(1)
    })

    it('shares one load between concurrent calls for the same key', async () => {
      const load = vi.fn().mockResolvedValue([])

      await Promise.all([cached('key', load), cached('key', load), cached('key', load)])

      expect(load).toHaveBeenCalledTimes(1)
    })

    it('loads separately for different keys', async () => {
      const load = vi.fn().mockResolvedValue([])

      await cached('key-1', load)
      await cached('key-2', load)

      expect(load).toHaveBeenCalledTimes(2)
    })

    it('reloads after 5 minutes', async () => {
      vi.useFakeTimers()
      const load = vi.fn().mockResolvedValue([])

      await cached('key', load)
      vi.advanceTimersByTime(TTL + 1)
      await cached('key', load)

      expect(load).toHaveBeenCalledTimes(2)
    })

    it('does not cache a failed load', async () => {
      const load = vi.fn().mockRejectedValueOnce(new Error('upstream down')).mockResolvedValueOnce([])

      await expect(cached('key', load)).rejects.toThrow('upstream down')
      expect(await cached('key', load)).toEqual([])
      expect(load).toHaveBeenCalledTimes(2)
    })
  })

  describe('fetchAuthorisedParcelIds', () => {
    const mockRequest = { auth: { credentials: { sbi: SBI } } }

    it('fetches parcel ids on a miss and serves them from cache after', async () => {
      fetchParcelsFromDal.mockResolvedValue([{ sheetId: 'sheet1', parcelId: 'parcel1' }])

      expect(await fetchAuthorisedParcelIds(mockRequest)).toEqual(['sheet1-parcel1'])
      expect(await fetchAuthorisedParcelIds(mockRequest)).toEqual(['sheet1-parcel1'])
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(1)
      expect(fetchParcelsFromDal).toHaveBeenCalledWith(mockRequest)
    })

    it('caches per SBI', async () => {
      fetchParcelsFromDal.mockResolvedValue([])

      await fetchAuthorisedParcelIds(mockRequest)
      await fetchAuthorisedParcelIds({ auth: { credentials: { sbi: '999999999' } } })

      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)
    })

    it('logs and returns null without caching when fetchParcelsFromDal throws', async () => {
      fetchParcelsFromDal
        .mockRejectedValueOnce(new Error('API connection failed'))
        .mockResolvedValueOnce([{ sheetId: 'sheet1', parcelId: 'parcel1' }])

      expect(await fetchAuthorisedParcelIds(mockRequest)).toBeNull()
      expect(debug).toHaveBeenCalledWith(
        'EXTERNAL_API_ERROR',
        {
          endpoint: 'fetchAuthorisedParcelIds (consolidated view)',
          errorMessage: 'fetch parcel data for auth check: API connection failed'
        },
        mockRequest
      )

      expect(await fetchAuthorisedParcelIds(mockRequest)).toEqual(['sheet1-parcel1'])
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)
    })
  })

  describe('clearParcelCache', () => {
    it("drops the SBI's parcel ids and parcels for every fields combination", async () => {
      fetchParcelsFromDal.mockResolvedValue([])
      const load = vi.fn().mockResolvedValue([])
      const sizeKey = sbiParcelsKey(SBI, ['size'])
      const actionsKey = sbiParcelsKey(SBI, ['size', 'actions'])

      await fetchAuthorisedParcelIds({ auth: { credentials: { sbi: SBI } } })
      await cachedSbiParcels(sizeKey, load)
      await cachedSbiParcels(actionsKey, load)

      await clearParcelCache(SBI)

      await fetchAuthorisedParcelIds({ auth: { credentials: { sbi: SBI } } })
      await cachedSbiParcels(sizeKey, load)
      await cachedSbiParcels(actionsKey, load)

      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)
      expect(load).toHaveBeenCalledTimes(4)
    })

    it("leaves other SBIs' entries cached", async () => {
      const load = vi.fn().mockResolvedValue([])
      const otherKey = sbiParcelsKey('999999999', ['size'])

      await cachedSbiParcels(otherKey, load)
      await clearParcelCache(SBI)
      await cachedSbiParcels(otherKey, load)

      expect(load).toHaveBeenCalledTimes(1)
    })
  })

  describe('before the plugin is registered', () => {
    it('throws rather than silently skipping the cache', async () => {
      vi.resetModules()
      const fresh = await import('./parcel-cache.js')

      expect(() => fresh.cachedSbiParcels('key', vi.fn())).toThrow(
        'Cached method landGrants.sbiParcels is not registered'
      )
    })
  })
})
