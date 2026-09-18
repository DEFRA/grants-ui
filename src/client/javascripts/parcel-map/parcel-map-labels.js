import { formatParcelReference } from '../../../shared/format-parcel.js'
import { LAYER_ID_LABEL_CLUSTER, PARCEL_ID_PROPERTY, SOURCE_ID_PARCEL_LABELS, SOURCE_ID_PARCELS } from './config.js'

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
  const recompute = () => {
    const source = /** @type {GeoJSONSource | undefined} */ (ml.getSource(SOURCE_ID_PARCEL_LABELS))
    if (!source || !ml.getSource(SOURCE_ID_PARCELS) || !ml.isSourceLoaded(SOURCE_ID_PARCELS)) {
      return
    }
    source.setData(buildLabelFeatures(ml))
  }

  ml.on('idle', recompute)
  cleanups.push(() => ml.off('idle', recompute))

  attachClusterExpandOnClick(ml, cleanups)
}

/**
 * Clicking a cluster badge zooms in just far enough to split it apart.
 * @param {MLMap} ml
 * @param {Array<() => void>} cleanups
 */
function attachClusterExpandOnClick(ml, cleanups) {
  const onClusterClick = (/** @type {MapMouseEvent & { features?: MapGeoJSONFeature[] }} */ e) => {
    const cluster = e.features?.[0]
    const clusterId = cluster?.properties?.cluster_id
    const source = /** @type {GeoJSONSource | undefined} */ (ml.getSource(SOURCE_ID_PARCEL_LABELS))
    if (!cluster || clusterId == null || !source) {
      return
    }
    source.getClusterExpansionZoom(clusterId).then((zoom) => {
      const [lng, lat] = /** @type {GeoJSON.Point} */ (cluster.geometry).coordinates
      ml.easeTo({ center: [lng, lat], zoom })
    }, Boolean) // ignore: rejects past the source's own max zoom
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
 * @param {MLMap} ml
 * @returns {GeoJSON.FeatureCollection}
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

  const features = [...boundsById].map(([id, { minLng, minLat, maxLng, maxLat }]) => ({
    type: /** @type {const} */ ('Feature'),
    geometry: {
      type: /** @type {const} */ ('Point'),
      coordinates: [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
    },
    properties: { id, label: formatParcelReference(id) }
  }))

  return { type: 'FeatureCollection', features }
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
