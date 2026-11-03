/**
 * @typedef {{ minLng: number, minLat: number, maxLng: number, maxLat: number }} BBox
 */

/**
 * The box covering both inputs.
 * @param {BBox} a
 * @param {BBox} b
 * @returns {BBox}
 */
export function unionBounds(a, b) {
  return {
    minLng: Math.min(a.minLng, b.minLng),
    minLat: Math.min(a.minLat, b.minLat),
    maxLng: Math.max(a.maxLng, b.maxLng),
    maxLat: Math.max(a.maxLat, b.maxLat)
  }
}

/**
 * The box covering a set of `[lng, lat]` positions, or null for none.
 * @param {Iterable<GeoJSON.Position>} positions
 * @returns {BBox | null}
 */
export function boundsOfPositions(positions) {
  /** @type {BBox | null} */
  let bounds = null
  for (const [lng, lat] of positions) {
    const point = { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat }
    bounds = bounds ? unionBounds(bounds, point) : point
  }
  return bounds
}

/**
 * The box covering every ring of a polygon, or null for an empty one.
 * @param {GeoJSON.Polygon | GeoJSON.MultiPolygon} geometry
 * @returns {BBox | null}
 */
export function boundsOfPolygon(geometry) {
  const rings = geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : geometry.coordinates
  return boundsOfPositions(rings.flat())
}

/**
 * The `[minLng, minLat, maxLng, maxLat]` form the search plugin fits to.
 * @param {BBox} bounds
 * @returns {[number, number, number, number]}
 */
export function boundsToArray({ minLng, minLat, maxLng, maxLat }) {
  return [minLng, minLat, maxLng, maxLat]
}

/**
 * The `[[minLng, minLat], [maxLng, maxLat]]` form MapLibre's fitBounds takes.
 * @param {BBox} bounds
 * @returns {[[number, number], [number, number]]}
 */
export function boundsToLngLatPairs({ minLng, minLat, maxLng, maxLat }) {
  return [
    [Number(minLng), Number(minLat)],
    [Number(maxLng), Number(maxLat)]
  ]
}

/**
 * The centre of a box as `[lng, lat]`.
 * @param {BBox} bounds
 * @returns {[number, number]}
 */
export function boundsCentre({ minLng, minLat, maxLng, maxLat }) {
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
}
