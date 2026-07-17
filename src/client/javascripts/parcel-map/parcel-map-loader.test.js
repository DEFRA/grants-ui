// @ts-nocheck
import { vi, describe, it, expect, afterEach } from 'vitest'
import { parseParcelResponse, fetchParcelData } from './parcel-map-loader.js'
import { PARCELS_GEOJSON_URL } from './config.js'

const resp = (body) => ({ ok: true, json: () => Promise.resolve(body) })

describe('parseParcelResponse', () => {
  it('reads ids from the GeoJSON Feature.id and builds the meta index in one pass', async () => {
    const data = await parseParcelResponse(
      resp({
        features: [
          { id: 'SD7148-9160', properties: { sheet_id: 'SD7148', areaHa: 2.5 } },
          { id: 'SD7148-9161', properties: { sheet_id: 'SD7148', areaHa: null } }
        ],
        bbox: { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 }
      })
    )

    expect(data.parcelIds).toEqual(['SD7148-9160', 'SD7148-9161'])
    expect(data.metaIndex['SD7148-9160']).toMatchObject({ id: 'SD7148-9160', areaHa: 2.5 })
    expect(data.geojsonUrl).toBeNull()
    expect(data.bbox).toEqual({ minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 })
  })

  it.each([
    ['coerces a numeric id to a string', [{ id: 42, properties: {} }], ['42']],
    [
      'falls back to properties.id when the top-level id is absent (mock shape)',
      [{ properties: { id: 'SD7148-9160' } }],
      ['SD7148-9160']
    ],
    [
      'skips ids that are neither string nor number',
      [{ id: 'SD7148-9160', properties: {} }, { id: { nope: true }, properties: {} }, { properties: {} }],
      ['SD7148-9160']
    ]
  ])('%s', async (_name, features, expected) => {
    const data = await parseParcelResponse(resp({ features }))
    expect(data.parcelIds).toEqual(expected)
    expect(Object.keys(data.metaIndex)).toEqual(expected)
  })

  it('points at the GeoJSON source when mock mode is flagged', async () => {
    const data = await parseParcelResponse(resp({ features: [{ id: 'A', properties: {} }], mock: true }))
    expect(data.geojsonUrl).toBe(PARCELS_GEOJSON_URL)
  })

  it('defaults bbox to null and features to [] when absent', async () => {
    const data = await parseParcelResponse(resp({}))
    expect(data.parcelIds).toEqual([])
    expect(data.bbox).toBeNull()
  })
})

describe('fetchParcelData', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the parsed data on a successful first attempt', async () => {
    global.fetch = vi.fn().mockResolvedValue(resp({ features: [{ id: 'A', properties: {} }] }))
    const data = await fetchParcelData()
    expect(data.parcelIds).toEqual(['A'])
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
