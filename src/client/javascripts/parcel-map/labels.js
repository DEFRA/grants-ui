import { formatParcelReference } from '../../../shared/format-parcel.js'
import { boundsCentre, boundsOfPolygon, boundsOfPositions, unionBounds } from './bounds.js'
import { fitToParcels } from './helpers.js'
import {
  CLUSTER_EXPAND_MAX_ZOOM,
  LAYER_ID_LABEL_CLUSTER,
  LAYER_ID_LABEL_CLUSTER_COUNT,
  PARCEL_ID_PROPERTY,
  SOURCE_ID_PARCEL_LABELS,
  SOURCE_ID_PARCELS
} from './config.js'

/**
 * @import { Map as MLMap, GeoJSONSource, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl'
 * @import { BBox } from './bounds.js'
 * @import { MapContext } from './element.js'
 */

/**
 * Keeps the label GeoJSON source (see buildParcelLabelLayer in helpers.js)
 * in sync with the parcel vector tiles: one Point feature per parcel id, at
 * the combined bounding-box centre of every rendered fragment of that parcel
 * — a parcel split across tiles has one fragment per tile, so this is what
 * keeps it labelled exactly once regardless of tiling. Also wires up
 * click-to-zoom on the cluster badges the source's clustering produces when
 * parcels are too close together to label individually.
 * @param {Pick<MapContext, 'ml' | 'cleanups'>} context
 */
export function attachParcelLabels({ ml, cleanups }) {
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
        // Capped so a tight bbox (e.g. a 2-3 parcel cluster) doesn't zoom
        // in further than useful to split it apart.
        fitToParcels(ml, boundsOfPoints(leaves), { animate: true, maxZoom: CLUSTER_EXPAND_MAX_ZOOM })
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
 * @returns {BBox | null}
 */
function boundsOfPoints(points) {
  return boundsOfPositions(points.map((point) => /** @type {GeoJSON.Point} */ (point.geometry).coordinates))
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

  /** @type {Map<string, BBox>} */
  const boundsById = new Map()
  for (const fragment of fragments) {
    const id = fragment.properties?.[PARCEL_ID_PROPERTY]
    const hasId = typeof id === 'string' || typeof id === 'number'
    const fragmentBounds = hasId
      ? boundsOfPolygon(/** @type {GeoJSON.Polygon | GeoJSON.MultiPolygon} */ (fragment.geometry))
      : null
    if (!fragmentBounds) {
      continue
    }
    const seen = boundsById.get(String(id))
    boundsById.set(String(id), seen ? unionBounds(seen, fragmentBounds) : fragmentBounds)
  }

  // Sorted by id so the fingerprint doesn't depend on fragment/iteration
  // order, only on which parcels are present and where.
  const entries = [...boundsById].sort(([a], [b]) => a.localeCompare(b))

  const features = entries.map(([id, bounds]) => ({
    type: /** @type {const} */ ('Feature'),
    geometry: {
      type: /** @type {const} */ ('Point'),
      coordinates: boundsCentre(bounds)
    },
    properties: { id, label: formatParcelReference(id) }
  }))

  const fingerprint = entries
    .map(([id, bounds]) => {
      const [lng, lat] = boundsCentre(bounds)
      return `${id}:${lng.toFixed(FINGERPRINT_DECIMAL_PLACES)},${lat.toFixed(FINGERPRINT_DECIMAL_PLACES)}`
    })
    .join('|')

  return { features: { type: 'FeatureCollection', features }, fingerprint }
}
