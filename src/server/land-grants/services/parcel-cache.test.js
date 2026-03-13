import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearParcelCache,
  getCachedAuthParcels,
  getCachedParcel,
  getCachedSbiParcels,
  setCachedAuthParcels,
  setCachedParcel,
  setCachedSbiParcels
} from './parcel-cache.js'

const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const TTL = 5 * SECONDS_PER_MINUTE * MS_PER_SECOND

describe('parcel-cache', () => {
  beforeEach(() => {
    clearParcelCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getCachedParcel', () => {
    it('returns null for unknown key', () => {
      expect(getCachedParcel('SD5649-9215')).toBeNull()
    })

    it('returns stored value', () => {
      const data = { actions: [], parcel: { parcelId: '9215', sheetId: 'SD5649' } }
      setCachedParcel('SD5649-9215', data)
      expect(getCachedParcel('SD5649-9215')).toEqual(data)
    })

    it('expires after 5 minutes', () => {
      vi.useFakeTimers()
      setCachedParcel('SD5649-9215', { actions: [] })
      vi.advanceTimersByTime(TTL + 1)
      expect(getCachedParcel('SD5649-9215')).toBeNull()
    })

    it('is still valid just before expiry', () => {
      vi.useFakeTimers()
      const data = { actions: [] }
      setCachedParcel('SD5649-9215', data)
      vi.advanceTimersByTime(TTL - 1)
      expect(getCachedParcel('SD5649-9215')).toEqual(data)
    })
  })

  describe('getCachedSbiParcels', () => {
    it('returns null for unknown SBI', () => {
      expect(getCachedSbiParcels('106284736')).toBeNull()
    })

    it('returns stored parcels', () => {
      const parcels = [{ parcelId: '9215', sheetId: 'SD5649', area: {} }]
      setCachedSbiParcels('106284736', parcels)
      expect(getCachedSbiParcels('106284736')).toEqual(parcels)
    })

    it('expires after 5 minutes', () => {
      vi.useFakeTimers()
      setCachedSbiParcels('106284736', [])
      vi.advanceTimersByTime(TTL + 1)
      expect(getCachedSbiParcels('106284736')).toBeNull()
    })
  })

  describe('getCachedAuthParcels', () => {
    it('returns null for unknown SBI', () => {
      expect(getCachedAuthParcels('106284736')).toBeNull()
    })

    it('returns stored parcel strings', () => {
      const parcels = ['SD5649-9215', 'SD7846-4509']
      setCachedAuthParcels('106284736', parcels)
      expect(getCachedAuthParcels('106284736')).toEqual(parcels)
    })

    it('expires after 5 minutes', () => {
      vi.useFakeTimers()
      setCachedAuthParcels('106284736', ['SD5649-9215'])
      vi.advanceTimersByTime(TTL + 1)
      expect(getCachedAuthParcels('106284736')).toBeNull()
    })
  })

  describe('clearParcelCache', () => {
    it('clears all three caches', () => {
      setCachedParcel('SD5649-9215', { actions: [] })
      setCachedSbiParcels('106284736', [])
      setCachedAuthParcels('106284736', ['SD5649-9215'])

      clearParcelCache()

      expect(getCachedParcel('SD5649-9215')).toBeNull()
      expect(getCachedSbiParcels('106284736')).toBeNull()
      expect(getCachedAuthParcels('106284736')).toBeNull()
    })
  })

  describe('eviction at capacity', () => {
    it('drops the oldest entry when full', () => {
      vi.useFakeTimers()

      for (let i = 0; i < 500; i++) {
        setCachedParcel(`key-${i}`, `value-${i}`)
      }

      setCachedParcel('key-500', 'value-500')

      expect(getCachedParcel('key-0')).toBeNull()
      expect(getCachedParcel('key-500')).toBe('value-500')
    })

    it('prefers evicting an expired entry over the oldest', () => {
      vi.useFakeTimers()

      for (let i = 0; i < 500; i++) {
        setCachedParcel(`key-${i}`, `value-${i}`)
      }

      vi.advanceTimersByTime(TTL + 1)

      setCachedParcel('key-500', 'value-500')

      expect(getCachedParcel('key-500')).toBe('value-500')
    })
  })
})
