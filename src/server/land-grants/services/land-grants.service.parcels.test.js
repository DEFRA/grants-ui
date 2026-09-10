// @ts-nocheck
import { vi } from 'vitest'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { fetchParcels as fetchParcelsService } from '~/src/server/land-grants/services/land-grants.service.js'
import { parcelsWithSize } from '~/src/server/land-grants/services/land-grants.client.js'
import { clearParcelCache } from '~/src/server/land-grants/services/parcel-cache.js'
import { CACHE_TTL_MS, mockApiEndpoint, mockUserContext, withUserContext } from './land-grants.service.test-helpers.js'

const fetchParcels = withUserContext(fetchParcelsService)

vi.mock('~/src/server/land-grants/services/land-grants.client.js', async (importOriginal) => {
  const { landGrantsClientMockOverrides } = await import('./land-grants.service.test-helpers.js')
  return { ...(await importOriginal()), ...landGrantsClientMockOverrides }
})

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigWithState } = await import('~/src/__mocks__/config-mocks.js')
  const { landGrantsApiConfigDefaults } = await import('./land-grants.service.test-helpers.js')
  return mockConfigWithState(landGrantsApiConfigDefaults)
})

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchParcelsFromDal: vi.fn()
}))

describe('land-grants service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchParcels', () => {
    const mockRequest = { auth: { credentials: { sbi: '106284736' } } }
    const oneParcel = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1' }]
    const oneParcelSize = {
      parcels: [{ parcelId: 'PARCEL1', sheetId: 'SHEET1', size: { total: 15.5, unit: 'ha' } }]
    }
    const oneParcelWithArea = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1', area: { total: 15.5, unit: 'ha' } }]

    beforeEach(() => {
      clearParcelCache()
    })

    it('should fetch parcels with size data successfully', async () => {
      const mockParcels = [
        { parcelId: 'PARCEL1', sheetId: 'SHEET1' },
        { parcelId: 'PARCEL2', sheetId: 'SHEET2' }
      ]
      const mockSizeResponse = {
        parcels: [
          {
            parcelId: 'PARCEL1',
            sheetId: 'SHEET1',
            size: { total: 15.5, unit: 'ha' }
          },
          {
            parcelId: 'PARCEL2',
            sheetId: 'SHEET2',
            size: { total: 22.3, unit: 'ha' }
          }
        ]
      }

      fetchParcelsFromDal.mockResolvedValueOnce(mockParcels)
      parcelsWithSize.mockResolvedValueOnce(mockSizeResponse)

      const result = await fetchParcels(mockRequest)

      expect(fetchParcelsFromDal).toHaveBeenCalledWith(mockRequest)
      expect(parcelsWithSize).toHaveBeenCalledWith(
        ['SHEET1-PARCEL1', 'SHEET2-PARCEL2'],
        mockApiEndpoint,
        mockUserContext,
        ['size']
      )
      expect(result).toEqual([
        {
          parcelId: 'PARCEL1',
          sheetId: 'SHEET1',
          area: { total: 15.5, unit: 'ha' }
        },
        {
          parcelId: 'PARCEL2',
          sheetId: 'SHEET2',
          area: { total: 22.3, unit: 'ha' }
        }
      ])
    })

    it('does not let a concurrent action-aware load block behind an in-flight size-only load', async () => {
      const actions = [{ code: 'CLIG3' }]
      fetchParcelsFromDal.mockResolvedValue(oneParcel)
      parcelsWithSize.mockImplementation(async (_ids, _url, _user, fields) => ({
        parcels: oneParcelSize.parcels.map((p) => ({ ...p, ...(fields.includes('actions') && { actions }) }))
      }))

      const sizeLoad = fetchParcelsService(mockRequest, mockUserContext)
      const actionLoad = fetchParcelsService(mockRequest, mockUserContext, ['size', 'actions'])

      expect(await sizeLoad).toEqual(oneParcelWithArea)
      expect(await actionLoad).toEqual([{ ...oneParcelWithArea[0], actions }])
      expect(await fetchParcelsService(mockRequest, mockUserContext)).toEqual(oneParcelWithArea)
      expect(await fetchParcelsService(mockRequest, mockUserContext, ['actions', 'size'])).toEqual([
        { ...oneParcelWithArea[0], actions }
      ])
      expect(parcelsWithSize).toHaveBeenCalledTimes(2)
    })

    it('runs sequential loads with cache reuse across size-only and action-aware calls', async () => {
      const actions = [{ code: 'CLIG3' }]
      fetchParcelsFromDal.mockResolvedValue(oneParcel)
      parcelsWithSize.mockImplementation(async (_ids, _url, _user, fields) => ({
        parcels: oneParcelSize.parcels.map((p) => ({ ...p, ...(fields.includes('actions') && { actions }) }))
      }))

      const sizeLoad = fetchParcelsService(mockRequest, mockUserContext)
      await sizeLoad
      const actionLoad = fetchParcelsService(mockRequest, mockUserContext, ['size', 'actions'])

      expect(await sizeLoad).toEqual(oneParcelWithArea)
      expect(await actionLoad).toEqual([{ ...oneParcelWithArea[0], actions }])
      expect(await fetchParcelsService(mockRequest, mockUserContext)).toEqual(oneParcelWithArea)
      expect(await fetchParcelsService(mockRequest, mockUserContext, ['actions', 'size'])).toEqual([
        { ...oneParcelWithArea[0], actions }
      ])
      expect(parcelsWithSize).toHaveBeenCalledTimes(2)
    })

    it('should handle parcels with missing size data', async () => {
      const mockParcels = [
        { parcelId: 'PARCEL1', sheetId: 'SHEET1' },
        { parcelId: 'PARCEL2', sheetId: 'SHEET2' }
      ]
      const mockSizeResponse = {
        parcels: [
          {
            parcelId: 'PARCEL1',
            sheetId: 'SHEET1',
            size: { total: 15.5, unit: 'ha' }
          }
        ]
      }

      fetchParcelsFromDal.mockResolvedValueOnce(mockParcels)
      parcelsWithSize.mockResolvedValueOnce(mockSizeResponse)

      const result = await fetchParcels(mockRequest)

      expect(result).toEqual([
        {
          parcelId: 'PARCEL1',
          sheetId: 'SHEET1',
          area: { total: 15.5, unit: 'ha' }
        },
        {
          parcelId: 'PARCEL2',
          sheetId: 'SHEET2',
          area: {}
        }
      ])
    })

    it('should handle empty parcels list', async () => {
      const mockParcels = []
      const mockSizeResponse = { parcels: [] }

      fetchParcelsFromDal.mockResolvedValueOnce(mockParcels)
      parcelsWithSize.mockResolvedValueOnce(mockSizeResponse)

      const result = await fetchParcels(mockRequest)

      expect(result).toEqual([])
    })

    it('should handle fetchParcelsFromDal error', async () => {
      fetchParcelsFromDal.mockRejectedValueOnce(new Error('SBI service error'))

      await expect(fetchParcels(mockRequest)).rejects.toThrow('SBI service error')
    })

    it('should handle size API error', async () => {
      fetchParcelsFromDal.mockResolvedValueOnce(oneParcel)
      parcelsWithSize.mockRejectedValueOnce(new Error('Size API error'))

      await expect(fetchParcels(mockRequest)).rejects.toThrow('Size API error')
    })

    it('should return cached result on second call with same SBI', async () => {
      fetchParcelsFromDal.mockResolvedValue(oneParcel)
      parcelsWithSize.mockResolvedValue(oneParcelSize)

      await fetchParcels(mockRequest)
      const secondResult = await fetchParcels(mockRequest)

      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(1)
      expect(secondResult).toEqual(oneParcelWithArea)
    })

    it('should fetch separately for different SBIs', async () => {
      fetchParcelsFromDal.mockResolvedValue(oneParcel)
      parcelsWithSize.mockResolvedValue(oneParcelSize)

      const otherRequest = { auth: { credentials: { sbi: '999999999' } } }

      await fetchParcels(mockRequest)
      await fetchParcels(otherRequest)

      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)
    })

    it('should re-fetch after cache TTL expires', async () => {
      vi.useFakeTimers()
      fetchParcelsFromDal.mockResolvedValue(oneParcel)
      parcelsWithSize.mockResolvedValue(oneParcelSize)

      await fetchParcels(mockRequest)
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(CACHE_TTL_MS + 1)

      await fetchParcels(mockRequest)
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('should not cache failed API calls', async () => {
      fetchParcelsFromDal.mockRejectedValueOnce(new Error('API error'))
      fetchParcelsFromDal.mockResolvedValueOnce(oneParcel)
      parcelsWithSize.mockResolvedValueOnce(oneParcelSize)

      await expect(fetchParcels(mockRequest)).rejects.toThrow('API error')

      const result = await fetchParcels(mockRequest)
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)
      expect(result).toEqual(oneParcelWithArea)
    })
  })
})
