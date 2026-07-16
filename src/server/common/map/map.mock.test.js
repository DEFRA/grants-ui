import { describe, expect, it, vi } from 'vitest'
import { buildMockFeatures } from './map.mock.js'

vi.mock('~/src/config/config.js', () => ({ config: { get: vi.fn() } }))

const makeParcels = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `SD0000-${i}`,
    sheetId: 'SD0000',
    parcelId: String(i),
    areaHa: null
  }))

describe('buildMockFeatures', () => {
  it('keeps parcel identity on each feature', () => {
    const { features } = buildMockFeatures([{ id: 'SD1234-5678', sheetId: 'SD1234', parcelId: '5678', areaHa: null }])
    expect(features).toHaveLength(1)
    expect(features[0].id).toBe('SD1234-5678')
    expect(features[0].properties).toMatchObject({ id: 'SD1234-5678', sheet_id: 'SD1234', parcel_id: '5678' })
    expect(features[0].geometry).toBeDefined()
  })

  it('never renders two parcels on the same footprint, dropping parcels beyond the shape limit', () => {
    const parcels = makeParcels(500)
    const { features } = buildMockFeatures(parcels)
    expect(features.length).toBeLessThan(parcels.length)
    const footprints = new Set(features.map((f) => JSON.stringify(f.geometry)))
    expect(footprints.size).toBe(features.length)
  })

  it('prefers the parcel real area over the mock shape area, falling back when missing', () => {
    const { features } = buildMockFeatures([
      { id: 'SD1-1', sheetId: 'SD1', parcelId: '1', areaHa: 3.21 },
      { id: 'SD1-2', sheetId: 'SD1', parcelId: '2', areaHa: null }
    ])
    expect(features[0].properties.areaHa).toBe(3.21)
    expect(typeof features[1].properties.areaHa).toBe('number')
  })

  it('returns a bbox that contains every rendered feature', () => {
    const { features, bbox } = buildMockFeatures(makeParcels(60))
    const inBbox = ([lng, lat]) => lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat
    for (const f of features) {
      const rings = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat(1) : f.geometry.coordinates
      expect(rings.flat(1).every(inBbox)).toBe(true)
    }
  })
})
