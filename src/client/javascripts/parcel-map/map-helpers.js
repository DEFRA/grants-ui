import {
  AREA_DECIMAL_PLACES,
  ERROR_LABEL_STYLES,
  ERROR_OVERLAY_STYLES,
  FILL_OPACITY_DEFAULT,
  FIT_BOUNDS_PADDING,
  getMapStyleAttribution,
  LABEL_CLUSTER_COLOR,
  LABEL_CLUSTER_MAX_ZOOM,
  LABEL_CLUSTER_RADIUS,
  LABEL_CLUSTER_RADIUS_PX,
  LABEL_CLUSTER_TEXT_COLOR,
  LABEL_HALO_COLOR,
  LABEL_TEXT_COLOR,
  LAYER_ID_FILL,
  LAYER_ID_LABEL,
  LAYER_ID_LABEL_CLUSTER,
  LAYER_ID_LABEL_CLUSTER_COUNT,
  LAYER_ID_OUTLINE,
  LAYER_LINE_WIDTH,
  LAYER_TEXT_HALO_WIDTH,
  LAYER_TEXT_SIZE,
  MAP_STYLE_URL,
  MSG_LOADING,
  MSG_UNKNOWN_AREA,
  MSG_UNKNOWN_PARCEL,
  PARCEL_CLICK_TOLERANCE_PX,
  PARCEL_COLORS,
  PARCEL_ID_PROPERTY,
  PARCEL_TILES_URL,
  SOURCE_ID_PARCEL_LABELS,
  SOURCE_ID_PARCELS,
  TOOLTIP_FALLBACK_MAP_WIDTH,
  TOOLTIP_MAX_WIDTH,
  TOOLTIP_OFFSET_X,
  TOOLTIP_VERTICAL_OFFSET
} from './config.js'
import { formatParcelReference } from '../../../shared/format-parcel.js'

/**
 * @import { MapGeoJSONFeature } from 'maplibre-gl'
 */

/**
 * @typedef {{ sheet_id?: unknown, parcel_id?: unknown, areaHa?: unknown, actionCount?: unknown, [key: string]: unknown }} ParcelProperties
 * @typedef {{ id: string } & ParcelProperties} ParcelMeta
 * @typedef {Record<string, ParcelMeta>} MetaIndex
 */

/** @type {GeoJSON.FeatureCollection} */
const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] }

// Same PARCEL_ID_PROPERTY the interact plugin matches on, so label/colour/
// highlight logic can't disagree with what's selected.
export const COMPOUND_ID_EXPR = ['get', PARCEL_ID_PROPERTY]

/**
 * Builds the fill and outline layer specs for the parcel vector-tile source.
 * `source-layer` is always `parcels` — the layer name inside the land-grants
 * vector tiles. Labels are a separate layer (see buildParcelLabelLayer) reading
 * from its own GeoJSON source, not this one.
 * @param {unknown[]} colorExpr  MapLibre `match` expression
 */
export function buildParcelLayers(colorExpr) {
  const src = { source: SOURCE_ID_PARCELS, 'source-layer': SOURCE_ID_PARCELS }
  return {
    fill: {
      id: LAYER_ID_FILL,
      type: 'fill',
      ...src,
      paint: {
        'fill-color': colorExpr,
        'fill-opacity': FILL_OPACITY_DEFAULT
      }
    },
    outline: {
      id: LAYER_ID_OUTLINE,
      type: 'line',
      ...src,
      paint: {
        'line-color': colorExpr,
        'line-width': LAYER_LINE_WIDTH
      }
    }
  }
}

// Set by MapLibre's clustering on grouped points only — distinguishes a
// cluster badge from an individual parcel point.
/** @type {import('maplibre-gl').FilterSpecification} */
const IS_CLUSTER_FILTER = ['has', 'point_count']

/**
 * The parcel label symbol layer, reading from the deduplicated GeoJSON source
 * (see parcel-map-labels.js) rather than the vector tile source, which would
 * place one label per tile a parcel's geometry appears in. Filtered to
 * unclustered points — a clustered point gets the count badge instead (see
 * buildParcelLabelClusterLayers).
 * @returns {import('maplibre-gl').SymbolLayerSpecification}
 */
export function buildParcelLabelLayer() {
  // OS Maps sets no `glyphs` URL, so any font renders locally via MapLibre's
  // TinySDF fallback.
  const labelFont = 'Arial Regular'
  return /** @type {import('maplibre-gl').SymbolLayerSpecification} */ ({
    id: LAYER_ID_LABEL,
    type: 'symbol',
    source: SOURCE_ID_PARCEL_LABELS,
    filter: /** @type {import('maplibre-gl').FilterSpecification} */ (['!', IS_CLUSTER_FILTER]),
    layout: {
      'text-field': ['get', 'label'],
      'text-font': [labelFont],
      'text-size': LAYER_TEXT_SIZE,
      'text-anchor': 'center'
    },
    paint: {
      'text-color': LABEL_TEXT_COLOR,
      'text-halo-color': LABEL_HALO_COLOR,
      'text-halo-width': LAYER_TEXT_HALO_WIDTH
    }
  })
}

/**
 * The clustered-parcels badge: a filled circle plus its count text, shown
 * below LABEL_CLUSTER_MAX_ZOOM in place of individual labels for parcels too
 * close together on screen.
 * @returns {{ circle: import('maplibre-gl').CircleLayerSpecification, count: import('maplibre-gl').SymbolLayerSpecification }}
 */
export function buildParcelLabelClusterLayers() {
  const src = { source: SOURCE_ID_PARCEL_LABELS, filter: IS_CLUSTER_FILTER }
  return {
    circle: /** @type {import('maplibre-gl').CircleLayerSpecification} */ ({
      id: LAYER_ID_LABEL_CLUSTER,
      type: 'circle',
      ...src,
      paint: {
        'circle-color': LABEL_CLUSTER_COLOR,
        'circle-radius': LABEL_CLUSTER_RADIUS,
        'circle-stroke-width': 2,
        'circle-stroke-color': LABEL_HALO_COLOR
      }
    }),
    count: /** @type {import('maplibre-gl').SymbolLayerSpecification} */ ({
      id: LAYER_ID_LABEL_CLUSTER_COUNT,
      type: 'symbol',
      ...src,
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Arial Regular'],
        'text-size': LAYER_TEXT_SIZE,
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': LABEL_CLUSTER_TEXT_COLOR
      }
    })
  }
}

/**
 * Resolves the MapLibre style URL/attribution for the OS Maps basemap, which is
 * served through the server-side proxy.
 * @returns {{ url: string, attribution: string }}
 */
export function getMapStyle() {
  return { url: MAP_STYLE_URL, attribution: getMapStyleAttribution() }
}

/**
 * Falls back to the nearest rendered parcel within PARCEL_CLICK_TOLERANCE_PX
 * when the interact plugin's strict inside-the-shape hit test finds nothing —
 * common for small parcels at low zoom. Also suppresses hits on a cluster
 * badge, so its click doesn't also select the parcel sitting behind it (the
 * interact plugin hit-tests every map click, not just ones on its own layer).
 *
 * Wrapped via `load()` because the map library hands us a provider
 * *descriptor*, not the provider itself — the real class only exists once
 * `load()` resolves.
 * @param {{ load: () => Promise<{ MapProvider: new (...args: never[]) => { map?: import('maplibre-gl').Map } }> }} descriptor
 */
export function withParcelHitTolerance(descriptor) {
  const originalLoad = descriptor.load
  descriptor.load = async () => {
    const result = await originalLoad()
    class ParcelHitToleranceProvider extends result.MapProvider {
      /**
       * @param {{ x: number, y: number }} point
       * @param {{ radius?: number }} [options]
       */
      getFeaturesAtPoint(point, options) {
        if (
          this.map?.getLayer(LAYER_ID_LABEL_CLUSTER) &&
          this.map.queryRenderedFeatures([point.x, point.y], { layers: [LAYER_ID_LABEL_CLUSTER] }).length > 0
        ) {
          return []
        }
        // @ts-ignore — base method exists on the runtime provider
        const hits = super.getFeaturesAtPoint(point, options)
        if (hits.length > 0 || !this.map?.getLayer(LAYER_ID_FILL)) {
          return hits
        }
        const r = PARCEL_CLICK_TOLERANCE_PX
        const rendered = this.map.queryRenderedFeatures(
          [
            [point.x - r, point.y - r],
            [point.x + r, point.y + r]
          ],
          { layers: [LAYER_ID_FILL] }
        )
        return nearestFeatureToPoint(this.map, point, rendered)
      }
    }
    return { ...result, MapProvider: ParcelHitToleranceProvider }
  }
  return descriptor
}

/**
 * Picks the rendered feature whose on-screen bounding-box centre is closest
 * to the click point. Used when two or more adjacent parcels both land in
 * the tolerance box — without this, `queryRenderedFeatures` order (not
 * proximity) would decide which one gets selected.
 * @param {import('maplibre-gl').Map} map
 * @param {{ x: number, y: number }} point
 * @param {import('maplibre-gl').MapGeoJSONFeature[]} features
 * @returns {import('maplibre-gl').MapGeoJSONFeature[]}
 */
export function nearestFeatureToPoint(map, point, features) {
  if (features.length <= 1) {
    return features
  }
  const distSq = (/** @type {import('maplibre-gl').MapGeoJSONFeature} */ f) => {
    const box = f.geometry.type.includes('Polygon') ? getScreenBounds(map, f) : null
    if (!box) {
      return Infinity
    }
    const cx = (box.minX + box.maxX) / 2
    const cy = (box.minY + box.maxY) / 2
    return (point.x - cx) ** 2 + (point.y - cy) ** 2
  }
  return [[...features].sort((a, b) => distSq(a) - distSq(b))[0]]
}

/**
 * On-screen pixel bounding box of a polygon/multipolygon feature.
 * @param {import('maplibre-gl').Map} map
 * @param {import('maplibre-gl').MapGeoJSONFeature} feature
 */
export function getScreenBounds(map, feature) {
  const geometry = /** @type {import('geojson').Polygon | import('geojson').MultiPolygon} */ (feature.geometry)
  const { type, coordinates } = geometry
  const rings = type === 'Polygon' ? coordinates : coordinates.flat()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      const { x, y } = map.project([lng, lat])
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY }
}

/**
 * A full-bleed overlay panel with a centred label. Backs both the loading
 * skeleton (`role="status"`) and the error overlay (`role="alert"`) — same box,
 * different role and message.
 * @param {string} message
 * @param {{ role: string, ariaLabel?: string }} options
 * @returns {HTMLDivElement}
 */
export function buildOverlay(message, { role, ariaLabel }) {
  const el = /** @type {HTMLDivElement} */ (document.createElement('div'))
  el.setAttribute('role', role)
  if (ariaLabel) {
    el.setAttribute('aria-label', ariaLabel)
  }
  el.style.cssText = ERROR_OVERLAY_STYLES
  const label = document.createElement('span')
  label.style.cssText = ERROR_LABEL_STYLES
  label.textContent = message
  el.appendChild(label)
  return el
}

/** @returns {HTMLDivElement} */
export function buildSkeleton() {
  return buildOverlay(MSG_LOADING, { role: 'status', ariaLabel: MSG_LOADING })
}

/**
 * Fits the viewport to the parcels' bounding box.
 * @param {import('maplibre-gl').Map | null} ml
 * @param {{ minLng: number, minLat: number, maxLng: number, maxLat: number } | null} bbox
 * @param {{ animate?: boolean }} [options]  animate defaults to false (used for the
 *   instant initial fit); pass true for a user-triggered reset (e.g. "Show all parcels")
 */
export function fitToParcels(ml, bbox, { animate = false } = {}) {
  if (!ml || !bbox) {
    return
  }
  const { minLng, minLat, maxLng, maxLat } = bbox
  ml.fitBounds(
    [
      [Number(minLng), Number(minLat)],
      [Number(maxLng), Number(maxLat)]
    ],
    { padding: FIT_BOUNDS_PADDING, animate }
  )
}

/**
 * Fits the viewport to the parcels' bounding box, then adds the parcel
 * vector-tile source streamed from the grants-ui tile proxy.
 * @param {import('maplibre-gl').Map} ml
 * @param {{ bbox: { minLng: number, minLat: number, maxLng: number, maxLat: number } | null }} data
 * @param {unknown[]} colorExpr  MapLibre `match` expression
 */
export function addParcelsToMap(ml, { bbox }, colorExpr) {
  fitToParcels(ml, bbox)

  if (ml.getSource(SOURCE_ID_PARCELS)) {
    return
  }

  const origin = globalThis.location.origin
  ml.addSource(
    SOURCE_ID_PARCELS,
    /** @type {import('maplibre-gl').VectorSourceSpecification} */ ({
      type: 'vector',
      tiles: [`${origin}${PARCEL_TILES_URL}`],
      // Dedupes a parcel split across tiles so its fill/outline render once.
      promoteId: PARCEL_ID_PROPERTY
    })
  )
  ml.addSource(SOURCE_ID_PARCEL_LABELS, {
    type: 'geojson',
    data: EMPTY_FEATURE_COLLECTION,
    cluster: true,
    clusterRadius: LABEL_CLUSTER_RADIUS_PX,
    clusterMaxZoom: LABEL_CLUSTER_MAX_ZOOM
  })
  const layers = buildParcelLayers(colorExpr)
  ml.addLayer(/** @type {import('maplibre-gl').LayerSpecification} */ (layers.fill))
  ml.addLayer(/** @type {import('maplibre-gl').LayerSpecification} */ (layers.outline))
  const labelClusterLayers = buildParcelLabelClusterLayers()
  ml.addLayer(labelClusterLayers.circle)
  ml.addLayer(labelClusterLayers.count)
  ml.addLayer(buildParcelLabelLayer())
}

/**
 * MapLibre `match` expression mapping compound parcel ID → colour.
 * @param {string[]} ids
 * @returns {unknown[]}
 */
export function buildColorExpr(ids) {
  const expr = /** @type {unknown[]} */ (['match', COMPOUND_ID_EXPR])
  ;[...new Set(ids)].forEach((id, i) => {
    expr.push(id, PARCEL_COLORS[i % PARCEL_COLORS.length])
  })
  expr.push(PARCEL_COLORS[0])
  return expr
}

/**
 * Compound parcel ID (e.g. "SD7148-9160") from a feature's PARCEL_ID_PROPERTY.
 * @param {MapGeoJSONFeature} feature
 * @returns {string}
 */
export function resolveFeatureId(feature) {
  const id = /** @type {ParcelProperties | undefined} */ (feature.properties)?.[PARCEL_ID_PROPERTY]
  return typeof id === 'string' || typeof id === 'number' ? String(id) : ''
}

/**
 * @param {HTMLElement} tooltip
 * @param {string} id
 * @param {ParcelProperties} props
 * @param {number} x
 * @param {number} y
 * @param {HTMLDivElement | null} mapEl
 */
export function showTooltip(tooltip, id, props, x, y, mapEl) {
  const areaHa = props.areaHa == null ? null : Number(props.areaHa)
  const actionCount = props.actionCount
  tooltip.innerHTML = `
    <strong style="display:block;margin-bottom:8px;font-size:15px">${htmlEncode(formatParcelReference(id) || MSG_UNKNOWN_PARCEL)}</strong>
    <div style="color:#505a5f;padding:2px 12px 2px 0;white-space:nowrap">
      Total area: ${areaHa == null ? MSG_UNKNOWN_AREA : htmlEncode(areaHa.toFixed(AREA_DECIMAL_PLACES) + ' ha')}
    </div>
    ${
      typeof actionCount === 'number'
        ? `<div style="color:#505a5f;padding:2px 12px 2px 0;white-space:nowrap">
      Available actions: ${actionCount}
    </div>`
        : ''
    }`
  tooltip.style.left = `${Math.min(x + TOOLTIP_OFFSET_X, (mapEl?.offsetWidth ?? TOOLTIP_FALLBACK_MAP_WIDTH) - TOOLTIP_MAX_WIDTH)}px`
  tooltip.style.top = `${y - TOOLTIP_VERTICAL_OFFSET}px`
  tooltip.style.display = 'block'
}

/** @param {HTMLElement} tooltip */
export function hideTooltip(tooltip) {
  tooltip.style.display = 'none'
}

/** @param {string} value @returns {string} */
export function htmlEncode(value) {
  const text = document.createTextNode(value)
  const div = document.createElement('div')
  div.appendChild(text)
  return div.innerHTML
}
