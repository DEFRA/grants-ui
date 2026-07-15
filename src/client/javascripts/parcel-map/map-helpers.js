import {
  MAP_STYLE_URL,
  getMapStyleAttribution,
  OSM_STYLE_URL,
  OSM_STYLE_ATTRIBUTION,
  BASEMAP_PROVIDER_OPENSTREETMAP,
  PARCEL_COLORS,
  LAYER_TEXT_SIZE,
  LAYER_TEXT_HALO_WIDTH,
  LAYER_LINE_WIDTH,
  AREA_DECIMAL_PLACES,
  PARCEL_ID_PROPERTY,
  PARCEL_CLICK_TOLERANCE_PX,
  SOURCE_ID_PARCELS,
  LAYER_ID_FILL,
  LAYER_ID_OUTLINE,
  LAYER_ID_LABEL,
  FILL_OPACITY_DEFAULT,
  ERROR_OVERLAY_STYLES,
  ERROR_LABEL_STYLES,
  LABEL_TEXT_COLOR,
  LABEL_HALO_COLOR,
  MSG_LOADING,
  MSG_UNKNOWN_PARCEL,
  MSG_UNKNOWN_AREA,
  TOOLTIP_OFFSET_X,
  TOOLTIP_MAX_WIDTH,
  TOOLTIP_FALLBACK_MAP_WIDTH,
  TOOLTIP_VERTICAL_OFFSET
} from './config.js'

/**
 * @import { MapGeoJSONFeature } from 'maplibre-gl'
 */

/**
 * @typedef {{ sheet_id?: unknown, parcel_id?: unknown, areaHa?: unknown, [key: string]: unknown }} ParcelProperties
 * @typedef {{ id: string } & ParcelProperties} ParcelMeta
 * @typedef {Record<string, ParcelMeta>} MetaIndex
 */

// Same PARCEL_ID_PROPERTY the interact plugin matches on, so label/colour/
// highlight logic can't disagree with what's selected.
export const COMPOUND_ID_EXPR = ['get', PARCEL_ID_PROPERTY]

/**
 * @param {unknown[]} colorExpr  MapLibre `match` expression
 * @param {string}   [sourceLayer]
 * @param {string}   [basemapProvider]  BASEMAP_PROVIDER_ORDNANCE_SURVEY | BASEMAP_PROVIDER_OPENSTREETMAP
 */
export function buildParcelLayers(colorExpr, sourceLayer, basemapProvider) {
  const src = sourceLayer ? { 'source-layer': sourceLayer } : {}
  // OS Maps sets no `glyphs` URL, so any font renders locally via MapLibre's
  // TinySDF fallback. TEMPORARY (TGC-1418 follow-up): CartoCDN's OpenStreetMap
  // style DOES set a glyphs URL, and only serves the fonts it declares in its
  // own layers ('Open Sans Regular' etc) — 'Arial Regular' 404s against it.
  // Delete this branch (keep 'Arial Regular') once OSM support is removed.
  const labelFont = basemapProvider === BASEMAP_PROVIDER_OPENSTREETMAP ? 'Open Sans Regular' : 'Arial Regular'
  return {
    fill: {
      id: LAYER_ID_FILL,
      type: 'fill',
      source: SOURCE_ID_PARCELS,
      ...src,
      paint: {
        'fill-color': colorExpr,
        'fill-opacity': FILL_OPACITY_DEFAULT
      }
    },
    outline: {
      id: LAYER_ID_OUTLINE,
      type: 'line',
      source: SOURCE_ID_PARCELS,
      ...src,
      paint: {
        'line-color': colorExpr,
        'line-width': LAYER_LINE_WIDTH
      }
    },
    label: {
      id: LAYER_ID_LABEL,
      type: 'symbol',
      source: SOURCE_ID_PARCELS,
      ...src,
      layout: {
        'text-field': COMPOUND_ID_EXPR,
        'text-font': [labelFont],
        'text-size': LAYER_TEXT_SIZE,
        'text-anchor': 'center'
      },
      paint: {
        'text-color': LABEL_TEXT_COLOR,
        'text-halo-color': LABEL_HALO_COLOR,
        'text-halo-width': LAYER_TEXT_HALO_WIDTH
      }
    }
  }
}

/**
 * Resolves the MapLibre style URL/attribution for the chosen basemap provider.
 * TEMPORARY (TGC-1418 follow-up): delete the ternary + provider param once
 * the OpenStreetMap comparison ends.
 * @param {string} provider  BASEMAP_PROVIDER_ORDNANCE_SURVEY | BASEMAP_PROVIDER_OPENSTREETMAP
 * @returns {{ url: string, attribution: string }}
 */
export function getMapStyle(provider) {
  // OSM's style/tiles are public (no key to protect), so its URL points
  // straight at CartoCDN; OS Maps stays server-proxied.
  return provider === BASEMAP_PROVIDER_OPENSTREETMAP
    ? { url: OSM_STYLE_URL, attribution: OSM_STYLE_ATTRIBUTION }
    : { url: MAP_STYLE_URL, attribution: getMapStyleAttribution() }
}

/**
 * Falls back to the nearest rendered parcel within PARCEL_CLICK_TOLERANCE_PX
 * when the interact plugin's strict inside-the-shape hit test finds nothing —
 * which is common for small parcels at low zoom.
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

/** @returns {HTMLDivElement} */
export function buildSkeleton() {
  const el = /** @type {HTMLDivElement} */ (document.createElement('div'))
  el.setAttribute('aria-label', MSG_LOADING)
  el.setAttribute('role', 'status')
  el.style.cssText = ERROR_OVERLAY_STYLES
  const label = document.createElement('span')
  label.style.cssText = ERROR_LABEL_STYLES
  label.textContent = MSG_LOADING
  el.appendChild(label)
  return el
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
  tooltip.innerHTML = `
    <strong style="display:block;margin-bottom:8px;font-size:15px">${htmlEncode(id || MSG_UNKNOWN_PARCEL)}</strong>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="color:#505a5f;padding:2px 12px 2px 0;white-space:nowrap">Total area</td>
          <td>${areaHa == null ? MSG_UNKNOWN_AREA : htmlEncode(areaHa.toFixed(AREA_DECIMAL_PLACES) + ' ha')}</td></tr>
    </table>`
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
