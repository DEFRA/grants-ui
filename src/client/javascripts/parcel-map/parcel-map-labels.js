import { formatParcelReference } from '../../../shared/format-parcel.js'
import {
  CLUSTER_EXPAND_MAX_ZOOM,
  FIT_BOUNDS_PADDING,
  LAYER_ID_LABEL_CLUSTER,
  PARCEL_ID_PROPERTY,
  SOURCE_ID_PARCEL_LABELS,
  SOURCE_ID_PARCELS
} from './config.js'

/**
 * @import { Map as MLMap, GeoJSONSource, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl'
 */

/**
 * Keeps the label GeoJSON source (see buildParcelLabelLayer in map-helpers.js)
 * in sync with the parcel vector tiles: one Point feature per parcel id, at
 * the combined bounding-box centre of every rendered fragment of that parcel
 * — a parcel split across tiles has one fragment per tile, so this is what
 * keeps it labelled exactly once regardless of tiling. Also wires up
 * click-to-zoom on the cluster badges the source's clustering produces when
 * parcels are too close together to label individually.
 * @param {MLMap} ml
 * @param {Array<() => void>} cleanups
 */
export function attachParcelLabels(ml, cleanups) {
  // setData() re-renders, which can re-fire 'idle' — only call it when the
  // features actually changed, to avoid a needless idle -> setData loop.
  /** @type {string | null} */
  let lastFingerprint = null

  const recompute = () => {
    const source = /** @type {GeoJSONSource | undefined} */ (ml.getSource(SOURCE_ID_PARCEL_LABELS))
    if (!source || !ml.getSource(SOURCE_ID_PARCELS) || !ml.isSourceLoaded(SOURCE_ID_PARCELS)) {
      return
    }
    const { features, fingerprint } = buildLabelFeatures(ml)
    if (fingerprint === lastFingerprint) {
      return
    }
    lastFingerprint = fingerprint
    source.setData(features)
  }

  ml.on('idle', recompute)
  cleanups.push(() => ml.off('idle', recompute))

  attachClusterExpandOnClick(ml, cleanups)
}

/**
 * Clicking a cluster badge zooms into the bounding box of the parcels it
 * groups, so they end up fully framed and split apart rather than just
 * zoomed toward the cluster's own centre point.
 * @param {MLMap} ml
 * @param {Array<() => void>} cleanups
 */
function attachClusterExpandOnClick(ml, cleanups) {
  const onClusterClick = (/** @type {MapMouseEvent & { features?: MapGeoJSONFeature[] }} */ e) => {
    const cluster = e.features?.[0]
    const clusterId = cluster?.properties?.cluster_id
    const pointCount = cluster?.properties?.point_count
    const source = /** @type {GeoJSONSource | undefined} */ (ml.getSource(SOURCE_ID_PARCEL_LABELS))
    if (!cluster || clusterId == null || typeof pointCount !== 'number' || !source) {
      return
    }
    source
      .getClusterLeaves(clusterId, pointCount, 0)
      .then((leaves) => {
        const bbox = boundsOfPoints(leaves)
        if (!bbox) {
          return
        }
        ml.fitBounds(
          [
            [bbox.minLng, bbox.minLat],
            [bbox.maxLng, bbox.maxLat]
          ],
          // Capped so a tight bbox (e.g. a 2-3 parcel cluster) doesn't zoom
          // in further than useful to split it apart.
          { padding: FIT_BOUNDS_PADDING, maxZoom: CLUSTER_EXPAND_MAX_ZOOM }
        )
      })
      .catch(Boolean) // ignore: e.g. the cluster no longer exists after a concurrent setData
  }
  const onMouseEnter = () => {
    ml.getCanvas().style.cursor = 'pointer'
  }
  const onMouseLeave = () => {
    ml.getCanvas().style.cursor = ''
  }

  ml.on('click', LAYER_ID_LABEL_CLUSTER, onClusterClick)
  ml.on('mouseenter', LAYER_ID_LABEL_CLUSTER, onMouseEnter)
  ml.on('mouseleave', LAYER_ID_LABEL_CLUSTER, onMouseLeave)

  cleanups.push(
    () => ml.off('click', LAYER_ID_LABEL_CLUSTER, onClusterClick),
    () => ml.off('mouseenter', LAYER_ID_LABEL_CLUSTER, onMouseEnter),
    () => ml.off('mouseleave', LAYER_ID_LABEL_CLUSTER, onMouseLeave)
  )
}

/**
 * The bounding box of a set of Point features, as returned by
 * getClusterLeaves — the ungrouped parcel label points a cluster badge
 * stands in for.
 * @param {GeoJSON.Feature[]} points
 * @returns {{ minLng: number, minLat: number, maxLng: number, maxLat: number } | null}
 */
function boundsOfPoints(points) {
  if (points.length === 0) {
    return null
  }
  const bounds = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity }
  for (const point of points) {
    const [lng, lat] = /** @type {GeoJSON.Point} */ (point.geometry).coordinates
    bounds.minLng = Math.min(bounds.minLng, lng)
    bounds.minLat = Math.min(bounds.minLat, lat)
    bounds.maxLng = Math.max(bounds.maxLng, lng)
    bounds.maxLat = Math.max(bounds.maxLat, lat)
  }
  return bounds
}

// Bounds are floating-point lng/lat, so two computations of an otherwise-
// unchanged parcel can differ in the last few decimal places — round before
// fingerprinting so that isn't mistaken for a real change.
const FINGERPRINT_DECIMAL_PLACES = 6

/**
 * @param {MLMap} ml
 * @returns {{ features: GeoJSON.FeatureCollection, fingerprint: string }}
 */
function buildLabelFeatures(ml) {
  const fragments = ml.querySourceFeatures(SOURCE_ID_PARCELS, { sourceLayer: SOURCE_ID_PARCELS })

  /** @type {Map<string, { minLng: number, minLat: number, maxLng: number, maxLat: number }>} */
  const boundsById = new Map()
  for (const fragment of fragments) {
    const id = fragment.properties?.[PARCEL_ID_PROPERTY]
    if (typeof id !== 'string' && typeof id !== 'number') {
      continue
    }
    extendBounds(boundsById, String(id), /** @type {GeoJSON.Polygon | GeoJSON.MultiPolygon} */ (fragment.geometry))
  }

  // Sorted by id so the fingerprint doesn't depend on fragment/iteration
  // order, only on which parcels are present and where.
  const entries = [...boundsById].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  const features = entries.map(([id, { minLng, minLat, maxLng, maxLat }]) => ({
    type: /** @type {const} */ ('Feature'),
    geometry: {
      type: /** @type {const} */ ('Point'),
      coordinates: [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
    },
    properties: { id, label: formatParcelReference(id) }
  }))

  const fingerprint = entries
    .map(([id, { minLng, minLat, maxLng, maxLat }]) => {
      const lng = ((minLng + maxLng) / 2).toFixed(FINGERPRINT_DECIMAL_PLACES)
      const lat = ((minLat + maxLat) / 2).toFixed(FINGERPRINT_DECIMAL_PLACES)
      return `${id}:${lng},${lat}`
    })
    .join('|')

  return { features: { type: 'FeatureCollection', features }, fingerprint }
}

/**
 * Widens `boundsById.get(id)` (creating it if absent) to cover every
 * coordinate in `geometry`.
 * @param {Map<string, { minLng: number, minLat: number, maxLng: number, maxLat: number }>} boundsById
 * @param {string} id
 * @param {GeoJSON.Polygon | GeoJSON.MultiPolygon} geometry
 */
function extendBounds(boundsById, id, geometry) {
  const existing = boundsById.get(id)
  const bounds = existing ?? { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity }
  const rings = geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : geometry.coordinates
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      bounds.minLng = Math.min(bounds.minLng, lng)
      bounds.minLat = Math.min(bounds.minLat, lat)
      bounds.maxLng = Math.max(bounds.maxLng, lng)
      bounds.maxLat = Math.max(bounds.maxLat, lat)
    }
  }
  boundsById.set(id, bounds)
}
