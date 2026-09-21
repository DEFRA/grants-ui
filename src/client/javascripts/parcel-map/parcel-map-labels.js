import { formatParcelReference } from '../../../shared/format-parcel.js'
import {
  CLUSTER_EXPAND_MAX_ZOOM,
  FIT_BOUNDS_PADDING,
  LAYER_ID_LABEL_CLUSTER,
  LAYER_ID_LABEL_CLUSTER_COUNT,
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

  attachClusters(ml, cleanups)
}

/**
 * Wires up cluster badge behaviour: click-to-zoom into the bounding box of
 * the parcels a cluster groups, and keeping the badge layers pinned to the
 * very top of the style so a badge always sits above a selected parcel's
 * border. The interactive-map plugin's own selection highlight adds a layer
 * and calls `moveLayer(id)` (no beforeId — i.e. "move to the top") on every
 * selection change, which would otherwise draw over the badge. `moveLayer`
 * always sets the style dirty even when nothing moves, so the reassertion
 * only calls it when the cluster layers aren't already last, to avoid
 * retriggering itself via `styledata`.
 * @param {MLMap} ml
 * @param {Array<() => void>} cleanups
 */
function attachClusters(ml, cleanups) {
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
  // interactive-map's own setupHoverCursor (a React effect, committed on its
  // own schedule — there's no reliable way to register after it) attaches a
  // plain 'mousemove' listener that unconditionally sets the cursor from
  // LAYER_ID_FILL alone, every time it fires. Whichever of that handler and
  // ours runs later on a given tick wins, so instead of racing it, this
  // re-asserts on the next animation frame — after every same-tick
  // 'mousemove' listener (vendor's included) has already run.
  let pendingFrame = 0
  const onMouseMove = (/** @type {MapMouseEvent} */ e) => {
    const { point } = e
    globalThis.cancelAnimationFrame(pendingFrame)
    pendingFrame = globalThis.requestAnimationFrame(() => {
      if (ml.queryRenderedFeatures(point, { layers: [LAYER_ID_LABEL_CLUSTER] }).length > 0) {
        ml.getCanvas().style.cursor = 'pointer'
      }
    })
  }

  ml.on('click', LAYER_ID_LABEL_CLUSTER, onClusterClick)
  ml.on('mousemove', onMouseMove)

  cleanups.push(
    () => ml.off('click', LAYER_ID_LABEL_CLUSTER, onClusterClick),
    () => ml.off('mousemove', onMouseMove),
    () => globalThis.cancelAnimationFrame(pendingFrame)
  )

  const reassertOnTop = () => {
    if (!ml.getLayer(LAYER_ID_LABEL_CLUSTER) || !ml.getLayer(LAYER_ID_LABEL_CLUSTER_COUNT)) {
      return
    }
    const order = ml.getStyle()?.layers?.map((layer) => layer.id) ?? []
    const CLUSTER_LAYER_COUNT = 2
    const lastTwo = order.slice(-CLUSTER_LAYER_COUNT)
    if (lastTwo[0] === LAYER_ID_LABEL_CLUSTER && lastTwo[1] === LAYER_ID_LABEL_CLUSTER_COUNT) {
      return
    }
    ml.moveLayer(LAYER_ID_LABEL_CLUSTER)
    ml.moveLayer(LAYER_ID_LABEL_CLUSTER_COUNT)
  }

  ml.on('styledata', reassertOnTop)
  cleanups.push(() => ml.off('styledata', reassertOnTop))
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

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareIds(a, b) {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
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
  const entries = [...boundsById].sort(([a], [b]) => compareIds(a, b))

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
