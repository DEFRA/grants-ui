import { PbfReader } from 'pbf'
import { VectorTile } from '@mapbox/vector-tile'
// @ts-ignore — no type declarations shipped with this package
import vtpbf from 'vt-pbf'
import { stringifyParcel } from '~/src/shared/format-parcel.js'
import { attemptSync } from '~/src/server/common/helpers/attempt.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * Adds an `id` property like "SD7148-9160" to every parcel in a map tile.
 *
 * The map's selection plugin needs one property that uniquely identifies each
 * parcel, but the land-grants API tiles only carry `sheet_id` and `parcel_id`
 * separately — and `parcel_id` alone repeats across sheets. We don't own that
 * API, so we stamp the combined ID on here as the tile passes through our proxy.
 * Any unexpected tile (empty, unparseable, no parcels layer) is returned
 * unchanged — the map still draws, only selection is affected. All other layers
 * pass through untouched.
 * @param {Buffer} buffer  raw tile bytes from the land-grants API
 * @param {string} [layerName]
 * @returns {Buffer} the same tile with `id` stamped on every parcel
 */
export function withCompoundParcelIds(buffer, layerName = 'parcels') {
  if (buffer.length === 0) {
    return buffer
  }

  const result = attemptSync(() => stampCompoundIds(buffer, layerName))

  if (!result.ok) {
    // A malformed tile, or a shape mismatch between the pbf/vt-pbf versions in
    // use, means the map still renders but selection silently stops matching
    // features — log it so that isn't invisible in production.
    log(LogCodes.SYSTEM.GENERIC_ERROR, { errorMessage: result.error.message })
    return buffer
  }

  return result.value ?? buffer
}

/**
 * @param {Buffer} buffer
 * @param {string} layerName
 * @returns {Buffer | null} null when the tile carries no parcels to stamp
 */
function stampCompoundIds(buffer, layerName) {
  const tile = new VectorTile(new PbfReader(buffer))
  const parcelsLayer = tile.layers[layerName]
  if (!parcelsLayer || parcelsLayer.length === 0) {
    return null
  }

  // Re-emit every layer. Only the parcels layer is transformed; the rest pass
  // through unchanged.
  const layers = /** @type {Record<string, unknown>} */ ({})
  for (const name of Object.keys(tile.layers)) {
    const layer = tile.layers[name]
    if (name !== layerName) {
      layers[name] = layer
      continue
    }
    layers[name] = stampLayer(layer)
  }

  return Buffer.from(vtpbf.fromVectorTileJs({ layers }))
}

/**
 * Returns a vt-pbf-compatible layer with the compound `id` stamped on every
 * feature that carries both `sheet_id` and `parcel_id`.
 * @param {import('@mapbox/vector-tile').VectorTileLayer} layer
 */
function stampLayer(layer) {
  const features = []
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    const { sheet_id: sheetId, parcel_id: parcelId } = feature.properties
    if (sheetId != null && parcelId != null) {
      feature.properties.id = stringifyParcel({ sheetId: String(sheetId), parcelId: String(parcelId) })
    }
    features.push(feature)
  }

  return {
    version: layer.version,
    name: layer.name,
    extent: layer.extent,
    length: features.length,
    feature: (/** @type {number} */ i) => features[i]
  }
}
