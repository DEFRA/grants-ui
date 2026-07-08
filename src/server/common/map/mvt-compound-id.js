import { PbfReader } from 'pbf'
import { VectorTile } from '@mapbox/vector-tile'
// @ts-ignore — no type declarations shipped with this package
import vtpbf from 'vt-pbf'

/**
 * Adds an `id` property like "SD7148-9160" to every parcel in a map tile.
 *
 * Why: the map's selection plugin needs ONE property that uniquely identifies
 * each parcel — it uses it to know which parcel you clicked, to draw the
 * highlight ring, and to label parcels in the keyboard menu. The tiles from
 * the land-grants API only carry `sheet_id` ("SD7148") and `parcel_id`
 * ("9160") as two separate properties, and neither is unique on its own
 * (parcel numbers repeat across sheets). The obvious fix would be for the
 * API to add the combined ID to its tiles, but we don't own that service —
 * so we do it here instead, as the tile passes through our proxy.
 *
 * How: a map tile is a compressed binary file (protobuf). We unpack it, loop
 * over the parcels, add `id` = sheet_id + "-" + parcel_id to each one, and
 * pack it back up. The shapes themselves are copied through untouched.
 *
 * If anything about the tile is unexpected (empty, unparseable, no parcels
 * layer) we return it exactly as we received it — the map still draws, and
 * only selection would be affected.
 * @param {Buffer} buffer  raw tile bytes from the land-grants API
 * @param {string} [layerName]
 * @returns {Buffer} the same tile with `id` stamped on every parcel
 */
export function withCompoundParcelIds(buffer, layerName = 'parcels') {
  if (buffer.length === 0) {
    return buffer
  }
  try {
    const tile = new VectorTile(new PbfReader(buffer))
    const layer = tile.layers[layerName]
    if (!layer) {
      return buffer
    }

    // Parse each feature once and cache it — vt-pbf reads `properties` and
    // `loadGeometry()` from whatever `feature(i)` returns, so mutations on
    // cached instances survive serialisation.
    const features = []
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i)
      const { sheet_id: sheetId, parcel_id: parcelId } = feature.properties
      if (sheetId != null && parcelId != null) {
        feature.properties.id = `${sheetId}-${parcelId}`
      }
      features.push(feature)
    }

    const cachedLayer = {
      version: layer.version,
      name: layer.name,
      extent: layer.extent,
      length: features.length,
      feature: (/** @type {number} */ i) => features[i]
    }

    return Buffer.from(vtpbf.fromVectorTileJs({ layers: { [layerName]: cachedLayer } }))
  } catch {
    // A malformed tile is the upstream's bug — pass it through unchanged so
    // the map still renders; selection simply won't match those features.
    return buffer
  }
}
