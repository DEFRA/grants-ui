import { PbfReader } from 'pbf'
import { VectorTile } from '@mapbox/vector-tile'
import vtpbf from 'vt-pbf'
import { withCompoundParcelIds } from './mvt-compound-id.js'

// Minimal vector-tile-js-compatible feature: vt-pbf reads `properties`,
// `type` (1=point, 2=line, 3=polygon) and `loadGeometry()` (tile coords).
function makeFeature(properties) {
  return {
    properties,
    type: 3,
    loadGeometry: () => [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 0, y: 0 }
      ]
    ]
  }
}

function makeTileBuffer(features, layerName = 'parcels') {
  const layer = {
    version: 2,
    name: layerName,
    extent: 4096,
    length: features.length,
    feature: (i) => features[i]
  }
  return Buffer.from(vtpbf.fromVectorTileJs({ layers: { [layerName]: layer } }))
}

function decode(buffer) {
  return new VectorTile(new PbfReader(buffer))
}

describe('withCompoundParcelIds', () => {
  it('adds the compound id property to every parcel feature', () => {
    const buffer = makeTileBuffer([
      makeFeature({ sheet_id: 'SD7148', parcel_id: '9160' }),
      makeFeature({ sheet_id: 'SD7149', parcel_id: '0001' })
    ])

    const layer = decode(withCompoundParcelIds(buffer)).layers.parcels

    expect(layer.length).toBe(2)
    expect(layer.feature(0).properties.id).toBe('SD7148-9160')
    expect(layer.feature(1).properties.id).toBe('SD7149-0001')
  })

  it('preserves the original properties and geometry', () => {
    const buffer = makeTileBuffer([makeFeature({ sheet_id: 'SD7148', parcel_id: '9160' })])

    const feature = decode(withCompoundParcelIds(buffer)).layers.parcels.feature(0)

    expect(feature.properties.sheet_id).toBe('SD7148')
    expect(feature.properties.parcel_id).toBe('9160')
    expect(feature.loadGeometry()).toEqual([
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 0, y: 0 }
      ]
    ])
  })

  it('skips features missing sheet_id or parcel_id', () => {
    const buffer = makeTileBuffer([makeFeature({ parcel_id: '9160' })])

    const feature = decode(withCompoundParcelIds(buffer)).layers.parcels.feature(0)

    expect(feature.properties.id).toBeUndefined()
  })

  it('returns the buffer unchanged when the parcels layer is absent', () => {
    const buffer = makeTileBuffer([makeFeature({ sheet_id: 'SD7148', parcel_id: '9160' })], 'other-layer')

    expect(withCompoundParcelIds(buffer)).toBe(buffer)
  })

  it('returns an empty buffer unchanged', () => {
    const buffer = Buffer.alloc(0)

    expect(withCompoundParcelIds(buffer)).toBe(buffer)
  })

  it('returns the original buffer when the tile cannot be parsed', () => {
    const garbage = Buffer.from([0xff, 0xff, 0xff, 0xff])

    expect(withCompoundParcelIds(garbage)).toBe(garbage)
  })
})
