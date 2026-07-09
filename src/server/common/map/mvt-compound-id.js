import { PbfReader } from 'pbf'
import { VectorTile } from '@mapbox/vector-tile'
// @ts-ignore — no type declarations shipped with this package
import vtpbf from 'vt-pbf'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * Adds an `id` property like "SD7148-9160" to every parcel in a map tile.
 *
 * The map's selection plugin needs one property that uniquely identifies each
 * parcel, but the land-grants API tiles only carry `sheet_id` and `parcel_id`
 * separately — and `parcel_id` alone repeats across sheets. We don't own that
 * API, so we stamp the combined ID on here as the tile passes through our proxy.
 *
 * Any unexpected tile (empty, unparseable, no parcels layer) is returned
 * unchanged — the map still draws, only selection is affected.
 * @param {Buffer} buffer  raw tile bytes from the land-grants API
 * @param {string} [layerName]
 * @returns {Buffer} the same tile with `id` stamped on every parcel
 */
export function withCompoundParcelIds(buffer, layerName = 'parcels') {
  if (buffer.length === 0) {
    return buffer
  }

  /** @type {unknown} */
  let transformError
  /** @type {Buffer | undefined} */
  let transformed
  try {
    const tile = new VectorTile(new PbfReader(buffer))
    const layer = tile.layers[layerName]
    if (!layer || layer.length === 0) {
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
        feature.properties.id = stringifyParcel({ sheetId: String(sheetId), parcelId: String(parcelId) })
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

    transformed = Buffer.from(vtpbf.fromVectorTileJs({ layers: { [layerName]: cachedLayer } }))
  } catch (error) {
    transformError = error
  }

  if (transformError !== undefined) {
    // A malformed tile, or a shape mismatch between the pbf/vt-pbf versions in
    // use, means the map still renders but selection silently stops matching
    // features — log it so that isn't invisible in production.
    log(LogCodes.SYSTEM.GENERIC_ERROR, { errorMessage: /** @type {Error} */ (transformError).message })
    return buffer
  }

  return transformed ?? buffer
}
