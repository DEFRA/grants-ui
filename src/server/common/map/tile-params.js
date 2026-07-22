import Joi from 'joi'
import { OS_MIN_ZOOM, OS_MAX_ZOOM } from './os-maps.js'

/**
 * Builds a per-route tile-param schema that clamps `z` to a valid zoom range and
 * `x`/`y` to `[0, 2^z)` — the only valid tile coordinates at that zoom. The
 * `x`/`y` bound depends on `z`, so it lives in an object-level `.custom()`; a
 * per-key `.max()` can't reference `2^z`. Without this, `/api/map/os-tiles`
 * forwards arbitrary coordinates straight to the metered OS key.
 * @param {{ minZoom: number, maxZoom: number }} range
 */
function makeTileParams({ minZoom, maxZoom }) {
  return {
    params: Joi.object({
      z: Joi.number().integer().min(minZoom).max(maxZoom).required(),
      x: Joi.number().integer().min(0).required(),
      y: Joi.number().integer().min(0).required()
    }).custom((value, helpers) => {
      const bound = 2 ** value.z
      return value.x >= bound || value.y >= bound ? helpers.error('any.invalid') : value
    })
  }
}

// Parcel vector tiles zoom deeper than the OS basemap. Max zoom mirrors the
// Land Grants API parcelTiles schema:
// https://github.com/DEFRA/land-grants-api/blob/vector-tile-spike/src/features/vector-tiles/schema/parcelTiles.schema.js
const PARCEL_MAX_ZOOM = 22

// Two named schemas so each route validates its own range. They share a min
// zoom but the parcel route accepts a deeper max, matching the vector-tile
// source.
export const osTileParams = makeTileParams({ minZoom: OS_MIN_ZOOM, maxZoom: OS_MAX_ZOOM })
export const parcelTileParams = makeTileParams({ minZoom: OS_MIN_ZOOM, maxZoom: PARCEL_MAX_ZOOM })
