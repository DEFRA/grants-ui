import { formatParcelReference } from '../../../shared/format-parcel.js'
import { boundsCentre, boundsOfPositions, unionBounds } from './bounds.js'
import { fitToParcels, showSingleParcelGroup } from './helpers.js'
import {
  CLUSTER_EXPAND_MAX_ZOOM,
  PARCEL_DETAIL_ZOOM,
  LAYER_ID_LABEL_CLUSTER,
  LAYER_ID_LABEL_CLUSTER_COUNT,
  SOURCE_ID_PARCEL_LABELS,
  SOURCE_ID_PARCELS
} from './config.js'

/**
 * @import { Map as MLMap, GeoJSONSource, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl'
 * @import { BBox } from './bounds.js'
 * @import { MapContext } from './element.js'
 */

/**
 * Builds one stable label point per holding parcel from its full bounds.
 * Polygon tiles can omit small parcels when zoomed out, so they must not
 * determine which parcels contribute to badge counts.
 * @param {Pick<MapContext, 'ml' | 'cleanups'> & Partial<Pick<MapContext, 'store'>>} context
 */
export function attachParcelLabels({ ml, cleanups, store }) {
  let initialViewPending = Boolean(store?.parcelIds.length)
  let labelsAdded = false
  const recompute = () => {
    const source = /** @type {GeoJSONSource | undefined} */ (ml.getSource(SOURCE_ID_PARCEL_LABELS))
    if (!source) {
      return
    }
    if (!labelsAdded) {
      source.setData(buildLabelFeatures(store))
      labelsAdded = true
      return
    }
    if (!initialViewPending || !ml.isSourceLoaded(SOURCE_ID_PARCEL_LABELS)) {
      return
    }
    const groups = new Map(
      ml
        .querySourceFeatures(SOURCE_ID_PARCEL_LABELS)
        .map((feature) => [feature.properties?.cluster_id ?? feature.properties?.id, feature])
    )
    const count = [...groups.values()].reduce((total, feature) => total + (feature.properties?.point_count ?? 1), 0)
    if (count !== store?.parcelIds.length) {
      return
    }
    initialViewPending = false
    if (groups.size === 1) {
      showSingleParcelGroup(ml, store?.bbox ?? null)
    }
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
    if (!cluster || (clusterId != null && typeof pointCount !== 'number')) {
      return
    }
    const leaves = clusterId == null ? Promise.resolve([cluster]) : source?.getClusterLeaves(clusterId, pointCount, 0)
    leaves
      ?.then((points) => {
        fitToParcels(ml, boundsOfPoints(points), {
          animate: true,
          maxZoom: CLUSTER_EXPAND_MAX_ZOOM,
          minZoom: PARCEL_DETAIL_ZOOM
        })
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
    const layers = ml.getStyle()?.layers ?? []
    syncHighlightZoom(ml, layers)
    const order = layers.map((layer) => layer.id)
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

/** @param {MLMap} ml @param {import('maplibre-gl').LayerSpecification[]} layers */
function syncHighlightZoom(ml, layers) {
  // The vendor's selection and keyboard highlights do not inherit minzoom.
  for (const layer of layers) {
    if (
      'source' in layer &&
      layer.source === SOURCE_ID_PARCELS &&
      /^(selected|active)-highlight/.test(layer.id) &&
      layer.minzoom !== PARCEL_DETAIL_ZOOM
    ) {
      ml.setLayerZoomRange(layer.id, PARCEL_DETAIL_ZOOM, layer.maxzoom ?? 24)
    }
  }
}

/**
 * Union of the parcel bounds carried by cluster leaves (or a singleton).
 * Use point coordinates when parcel bounds are unavailable.
 * @param {GeoJSON.Feature[]} points
 * @returns {BBox | null}
 */
function boundsOfPoints(points) {
  return points.reduce((bounds, point) => {
    const properties = point.properties ?? {}
    const { minLng, minLat, maxLng, maxLat } = properties
    const box = [minLng, minLat, maxLng, maxLat].every(Number.isFinite)
      ? { minLng, minLat, maxLng, maxLat }
      : boundsOfPositions([/** @type {GeoJSON.Point} */ (point.geometry).coordinates])
    if (!box) {
      return bounds
    }
    return bounds ? unionBounds(bounds, box) : box
  }, /** @type {BBox | null} */ (null))
}

/**
 * @param {MapContext['store'] | undefined} store
 * @returns {GeoJSON.FeatureCollection<GeoJSON.Point>}
 */
function buildLabelFeatures(store) {
  const features = (store?.parcelIds ?? []).flatMap((id) => {
    const bounds = store?.metaIndex[id]?.bounds
    if (!bounds) {
      return []
    }
    return [
      {
        type: /** @type {const} */ ('Feature'),
        geometry: { type: /** @type {const} */ ('Point'), coordinates: boundsCentre(bounds) },
        properties: { id, label: formatParcelReference(id), ...bounds }
      }
    ]
  })
  return { type: 'FeatureCollection', features }
}
