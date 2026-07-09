/* eslint-disable no-console */
// @ts-ignore — no type declarations shipped with this package
import InteractiveMap from '@defra/interactive-map'
// @ts-ignore — no type declarations shipped with this package
import maplibreProvider from '@defra/interactive-map/providers/maplibre'
// @ts-ignore — no type declarations shipped with this package
import createInteractPlugin from '@defra/interactive-map/plugins/interact'
import {
  PARCELS_API_URL,
  PARCEL_TILES_URL,
  PARCELS_GEOJSON_URL,
  MAP_LABEL,
  MAP_STYLE_URL,
  getMapStyleAttribution,
  DEFAULT_BASEMAP_PROVIDER,
  // TEMPORARY: OS Maps vs OpenStreetMap comparison (TGC-1418 follow-up) — see config.js
  OSM_STYLE_URL,
  OSM_STYLE_ATTRIBUTION,
  BASEMAP_PROVIDER_OPENSTREETMAP,
  PARCEL_COLORS,
  LAYER_TEXT_SIZE,
  LAYER_TEXT_HALO_WIDTH,
  LAYER_LINE_WIDTH,
  FIT_BOUNDS_PADDING,
  AREA_DECIMAL_PLACES,
  TOOLTIP_STYLES,
  PARCEL_ID_PROPERTY,
  PARCEL_CLICK_TOLERANCE_PX,
  LAYER_ID_FILL,
  LAYER_ID_OUTLINE,
  LAYER_ID_LABEL,
  FILL_OPACITY_DEFAULT,
  FILL_OPACITY_SELECTED,
  MAP_DEFAULT_HEIGHT,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_MIN_ZOOM,
  MAP_LOAD_TIMEOUT_MS,
  FETCH_MAX_ATTEMPTS,
  FETCH_RETRY_DELAY_MS,
  TOOLTIP_OFFSET_X,
  TOOLTIP_MAX_WIDTH,
  TOOLTIP_FALLBACK_MAP_WIDTH,
  EVENT_READY,
  EVENT_ERROR,
  EVENT_SELECTION,
  STATE_IDLE,
  STATE_LOADING,
  STATE_READY,
  STATE_ERROR,
  ERROR_OVERLAY_STYLES,
  ERROR_LABEL_STYLES,
  LABEL_TEXT_COLOR,
  LABEL_HALO_COLOR,
  SELECTION_NONE_SENTINEL,
  MSG_LOADING,
  MSG_ERROR_UNAVAILABLE,
  MSG_UNKNOWN_PARCEL,
  MSG_UNKNOWN_AREA,
  TOOLTIP_VERTICAL_OFFSET
} from './config.js'

/**
 * @import { Map as MLMap, MapGeoJSONFeature } from 'maplibre-gl'
 */

/**
 * @typedef {{ sheet_id?: unknown, parcel_id?: unknown, areaHa?: unknown, [key: string]: unknown }} ParcelProperties
 * @typedef {{ id: string } & ParcelProperties} ParcelMeta
 * @typedef {Record<string, ParcelMeta>} MetaIndex
 * @typedef {{ parcelIds: string[], metaIndex: MetaIndex, geojsonUrl: string | null, bbox: BBox | null }} ParcelData
 * @typedef {{ minLng: number, minLat: number, maxLng: number, maxLat: number }} BBox
 */

// MapLibre expression reading the compound "SHEET-PARCEL" ID. This is the
// same `id` property the interact plugin matches selections against
// (PARCEL_ID_PROPERTY) — reading it here too means the component's label,
// colour, and highlight logic can never disagree with what the plugin
// selected.
const COMPOUND_ID_EXPR = ['get', PARCEL_ID_PROPERTY]

/**
 * @param {unknown[]} colorExpr  MapLibre `match` expression
 * @param {string}   [sourceLayer]
 * @param {string}   [basemapProvider]  BASEMAP_PROVIDER_ORDNANCE_SURVEY | BASEMAP_PROVIDER_OPENSTREETMAP
 */
function buildParcelLayers(colorExpr, sourceLayer, basemapProvider) {
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
      source: 'parcels',
      ...src,
      paint: {
        'fill-color': colorExpr,
        'fill-opacity': FILL_OPACITY_DEFAULT
      }
    },
    outline: {
      id: LAYER_ID_OUTLINE,
      type: 'line',
      source: 'parcels',
      ...src,
      paint: {
        'line-color': colorExpr,
        'line-width': LAYER_LINE_WIDTH
      }
    },
    label: {
      id: LAYER_ID_LABEL,
      type: 'symbol',
      source: 'parcels',
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

// <parcel-map multi-select="true|false" basemap-provider="ordnance-survey|openstreetmap">
// basemap-provider's "openstreetmap" value is TEMPORARY (TGC-1418 follow-up).
// Height via CSS on the element. Dispatches:
//   parcel-map:ready, parcel-map:error, parcel-map:selection → { selectedIds: string[] }
class ParcelMap extends HTMLElement {
  /** @type {typeof STATE_IDLE | typeof STATE_LOADING | typeof STATE_READY | typeof STATE_ERROR} */
  #state = STATE_IDLE

  /** @type {InstanceType<typeof InteractiveMap> | null} */
  #mapInstance = null

  /** @type {ReturnType<typeof createInteractPlugin> | null} */
  #interactPlugin = null

  /** @type {HTMLDivElement | null} */
  #mapEl = null

  /** @type {HTMLDivElement | null} */
  #skeleton = null

  /** @type {HTMLDivElement | null} */
  #errorOverlay = null

  /** @type {Array<() => void>} */
  #mlCleanup = []

  #connected = false

  static get observedAttributes() {
    return ['basemap-provider']
  }

  connectedCallback() {
    this.#connected = true
    this.#state = STATE_IDLE
    this.#init()
  }

  disconnectedCallback() {
    this.#connected = false
    this.#teardown()
  }

  attributeChangedCallback(name) {
    // Ignore the attribute's own initial set before the element is connected,
    // and any change while a load is already in flight (that in-flight load
    // will pick up the new value once it settles into an idle/error state).
    if (name !== 'basemap-provider' || !this.#connected || this.#state === STATE_LOADING) {
      return
    }
    this.#teardown()
    this.#state = STATE_IDLE
    this.#init()
  }

  #teardown() {
    this.#state = STATE_IDLE
    for (const off of this.#mlCleanup) {
      off()
    }
    this.#mlCleanup = []
    try {
      this.#mapInstance?.destroy?.()
    } catch {
      /* ignore */
    }
    this.#mapInstance = null
    this.#interactPlugin = null
    this.#mapEl?.parentElement?.remove()
    this.#mapEl = null
    this.#skeleton?.remove()
    this.#skeleton = null
    this.#errorOverlay?.remove()
    this.#errorOverlay = null
  }

  async #init() {
    this.#state = STATE_LOADING

    // Read once per init — basemap-provider changes trigger a fresh #init via
    // attributeChangedCallback, so this always reflects the current value.
    const multiSelect = this.getAttribute('multi-select') === 'true'
    const basemapProvider = this.getAttribute('basemap-provider') || DEFAULT_BASEMAP_PROVIDER

    this.#skeleton = buildSkeleton()
    this.appendChild(this.#skeleton)

    const [ml, data] = await Promise.all([this.#initMap(multiSelect, basemapProvider), this.#fetchData()])

    // Torn down (disconnected) while we were loading, nothing to wire up.
    if (this.#state !== STATE_LOADING) {
      return
    }

    if (!ml || !data) {
      this.#teardown()
      this.#state = STATE_ERROR
      this.#showError(MSG_ERROR_UNAVAILABLE)
      this.dispatchEvent(new CustomEvent(EVENT_ERROR, { bubbles: true, detail: { reason: 'unavailable' } }))
    } else if (data.parcelIds.length === 0) {
      this.#teardown()
      this.#state = STATE_ERROR
      this.dispatchEvent(new CustomEvent(EVENT_ERROR, { bubbles: true, detail: { reason: 'no-parcels' } }))
    } else {
      const colorExpr = buildColorExpr(data.parcelIds)
      this.#addParcelsToMap(ml, data, colorExpr, basemapProvider)
      const tooltip = this.#attachTooltip(ml, data.metaIndex)
      this.#attachSelectionRelay(ml, tooltip)
      this.#interactPlugin?.enable()

      this.#state = STATE_READY
      this.#skeleton?.remove()
      this.#skeleton = null

      this.dispatchEvent(new CustomEvent(EVENT_READY, { bubbles: true }))
    }
  }

  /** @param {string} message */
  #showError(message) {
    const el = /** @type {HTMLDivElement} */ (document.createElement('div'))
    el.setAttribute('role', 'alert')
    el.style.cssText = ERROR_OVERLAY_STYLES
    const label = document.createElement('span')
    label.style.cssText = ERROR_LABEL_STYLES
    label.textContent = message
    el.appendChild(label)
    this.appendChild(el)
    this.#errorOverlay = el
  }

  /**
   * @param {boolean} multiSelect
   * @param {string} basemapProvider  BASEMAP_PROVIDER_OS | BASEMAP_PROVIDER_OSM
   * @returns {Promise<MLMap | null>}
   */
  #initMap(multiSelect, basemapProvider) {
    return new Promise((resolve) => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'position:relative;width:100%;height:100%'

      const mapEl = /** @type {HTMLDivElement} */ (document.createElement('div'))
      mapEl.id = `parcel-map-${crypto.randomUUID()}`
      mapEl.style.cssText = 'width:100%;height:100%'
      wrapper.appendChild(mapEl)
      this.#mapEl = mapEl

      if (this.#skeleton) {
        this.insertBefore(wrapper, this.#skeleton)
      } else {
        this.appendChild(wrapper)
      }

      // Handles feature selection accessibly: pointer clicks, a touch
      // crosshair + Select button, and a keyboard-navigable feature listbox.
      const interactPlugin = createInteractPlugin({
        interactionModes: ['selectFeature'],
        multiSelect,
        deselectOnClickOutside: true,
        layers: [
          {
            layerId: LAYER_ID_FILL,
            idProperty: PARCEL_ID_PROPERTY,
            labelProperty: PARCEL_ID_PROPERTY
          }
        ]
      })
      this.#interactPlugin = interactPlugin

      const map = new InteractiveMap(mapEl.id, {
        behaviour: 'inline',
        mapLabel: MAP_LABEL,
        containerHeight: this.style.height || MAP_DEFAULT_HEIGHT,
        mapProvider: withParcelHitTolerance(maplibreProvider()),
        mapStyle: getMapStyle(basemapProvider),
        plugins: [interactPlugin],
        center: MAP_DEFAULT_CENTER,
        zoom: MAP_DEFAULT_ZOOM,
        // The OS raster basemap has no tiles below z7 — stop users zooming
        // out into blank void.
        // TEMPORARY (TGC-1418 follow-up): the OSM/CartoCDN vector style
        // covers the full zoom range, so it's exempted from the cap below.
        // When OSM is removed, replace this with a plain `MAP_MIN_ZOOM`.
        minZoom: basemapProvider === BASEMAP_PROVIDER_OPENSTREETMAP ? undefined : MAP_MIN_ZOOM,
        // Don't persist the viewport in URL params.
        urlPosition: 'none'
      })
      this.#mapInstance = map

      map.on('map:error', (/** @type {unknown} */ err) => {
        console.error('[parcel-map] map failed to load', err)
        resolve(null)
      })

      const timeout = globalThis.setTimeout(() => resolve(null), MAP_LOAD_TIMEOUT_MS)

      // map:ready gives us the raw MapLibre instance; map:stylechange is the
      // earliest point addSource/addLayer can safely be called.
      /** @type {MLMap | null} */
      let mlInstance = null
      map.on('map:ready', (/** @type {{ map: MLMap }} */ { map: m }) => {
        mlInstance = m
        // Also catch native MapLibre errors (e.g. style fetch failure) which
        // @defra/interactive-map does not surface as map:error.
        m.on('error', (/** @type {unknown} */ err) => {
          console.error('[parcel-map] maplibre error', err)
          globalThis.clearTimeout(timeout)
          resolve(null)
        })
      })
      map.on('map:stylechange', () => {
        if (mlInstance && this.#state === STATE_LOADING) {
          globalThis.clearTimeout(timeout)
          resolve(mlInstance)
        }
      })
    })
  }

  /** @returns {Promise<ParcelData | null>} */
  async #fetchData() {
    /** @type {unknown} */
    let lastError
    for (let attempt = 0; attempt < FETCH_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, FETCH_RETRY_DELAY_MS))
      }
      try {
        const resp = await fetch(PARCELS_API_URL)
        if (resp.ok) {
          return this.#parseParcelResponse(resp)
        }
        lastError = new Error(`HTTP ${resp.status}`)
      } catch (err) {
        lastError = err
      }
    }
    console.error('[parcel-map] parcels fetch failed', lastError)
    return null
  }

  /**
   * @param {Response} resp
   * @returns {Promise<ParcelData>}
   */
  async #parseParcelResponse(resp) {
    /** @type {{ features: GeoJSON.Feature[], bbox: BBox | null, mock?: boolean }} */
    const body = await resp.json()
    const features = Array.isArray(body.features) ? body.features : []

    /** @type {string[]} */
    const parcelIds = features.flatMap((f) => {
      const id = f.id ?? f.properties?.id
      return typeof id === 'string' || typeof id === 'number' ? [String(id)] : []
    })

    const metaIndex = Object.fromEntries(
      features.flatMap((f) => {
        const id = f.id ?? f.properties?.id
        const key = typeof id === 'string' || typeof id === 'number' ? String(id) : null
        return key ? [[key, { ...f.properties, id: key }]] : []
      })
    )

    return {
      parcelIds,
      metaIndex,
      geojsonUrl: body.mock ? PARCELS_GEOJSON_URL : null,
      bbox: body.bbox ?? null
    }
  }

  /**
   * @param {MLMap} ml
   * @param {ParcelData} data
   * @param {unknown[]} colorExpr
   * @param {string} basemapProvider  BASEMAP_PROVIDER_ORDNANCE_SURVEY | BASEMAP_PROVIDER_OPENSTREETMAP
   */
  #addParcelsToMap(ml, { geojsonUrl, bbox }, colorExpr, basemapProvider) {
    if (bbox) {
      const { minLng, minLat, maxLng, maxLat } = bbox
      ml.fitBounds(
        [
          [Number(minLng), Number(minLat)],
          [Number(maxLng), Number(maxLat)]
        ],
        { padding: FIT_BOUNDS_PADDING, animate: false }
      )
    }

    if (ml.getSource('parcels')) {
      return
    }

    const origin = globalThis.location.origin
    const source = geojsonUrl
      ? /** @type {import('maplibre-gl').GeoJSONSourceSpecification} */ ({
          type: 'geojson',
          data: geojsonUrl.startsWith('http') ? geojsonUrl : `${origin}${geojsonUrl}`
        })
      : /** @type {import('maplibre-gl').VectorSourceSpecification} */ ({
          type: 'vector',
          tiles: [`${origin}${PARCEL_TILES_URL}`]
        })
    ml.addSource('parcels', source)
    const layers = buildParcelLayers(colorExpr, geojsonUrl ? undefined : 'parcels', basemapProvider)
    ml.addLayer(/** @type {import('maplibre-gl').LayerSpecification} */ (layers.fill))
    ml.addLayer(/** @type {import('maplibre-gl').LayerSpecification} */ (layers.outline))
    ml.addLayer(/** @type {import('maplibre-gl').LayerSpecification} */ (layers.label))
  }

  /**
   * @param {MLMap} ml
   * @param {MetaIndex} metaIndex
   */
  #attachTooltip(ml, metaIndex) {
    const wrapper = this.#mapEl?.parentElement
    if (!wrapper) {
      return undefined
    }

    const tooltip = document.createElement('div')
    tooltip.setAttribute('role', 'tooltip')
    tooltip.setAttribute('aria-live', 'polite')
    tooltip.style.cssText = TOOLTIP_STYLES
    wrapper.appendChild(tooltip)

    const onTooltipClick = (
      /** @type {import('maplibre-gl').MapMouseEvent & { features?: import('maplibre-gl').MapGeoJSONFeature[] }} */ e
    ) => {
      const feature = e.features?.[0]
      if (!feature) {
        return
      }
      const id = resolveFeatureId(feature)
      const props = /** @type {ParcelProperties} */ ({ ...feature.properties, ...metaIndex[id] })
      const point = ml.project(e.lngLat)
      showTooltip(tooltip, id, props, point.x, point.y, this.#mapEl)
    }
    const onMapClick = (/** @type {import('maplibre-gl').MapMouseEvent} */ e) => {
      if (ml.getLayer(LAYER_ID_FILL) && ml.queryRenderedFeatures(e.point, { layers: [LAYER_ID_FILL] }).length === 0) {
        hideTooltip(tooltip)
      }
    }
    const onMouseEnter = () => {
      ml.getCanvas().style.cursor = 'pointer'
    }
    const onMouseLeave = () => {
      ml.getCanvas().style.cursor = ''
    }

    ml.on('click', LAYER_ID_FILL, onTooltipClick)
    ml.on('click', onMapClick)
    ml.on('mouseenter', LAYER_ID_FILL, onMouseEnter)
    ml.on('mouseleave', LAYER_ID_FILL, onMouseLeave)

    this.#mlCleanup.push(
      () => ml.off('click', LAYER_ID_FILL, onTooltipClick),
      () => ml.off('click', onMapClick),
      () => ml.off('mouseenter', LAYER_ID_FILL, onMouseEnter),
      () => ml.off('mouseleave', LAYER_ID_FILL, onMouseLeave)
    )

    return tooltip
  }

  /**
   * Bridges the interact plugin's selection state to this component's public
   * API: re-applies the fill-opacity highlight and re-dispatches selection
   * changes as `parcel-map:selection` events. Selection input handling
   * (click, touch crosshair, keyboard listbox) lives in the plugin.
   * @param {MLMap} ml
   * @param {HTMLElement | undefined} tooltip
   */
  #attachSelectionRelay(ml, tooltip) {
    /** @param {string[]} selectedIds */
    const applyHighlight = (selectedIds) => {
      const matchList = selectedIds.length > 0 ? selectedIds : [SELECTION_NONE_SENTINEL]
      ml.setPaintProperty(LAYER_ID_FILL, 'fill-opacity', [
        'match',
        COMPOUND_ID_EXPR,
        matchList,
        FILL_OPACITY_SELECTED,
        FILL_OPACITY_DEFAULT
      ])
    }

    this.#mapInstance?.on(
      'interact:selectionchange',
      (/** @type {{ selectedFeatures: Array<{ featureId: string | number }> }} */ { selectedFeatures }) => {
        const selectedIds = selectedFeatures.map((f) => String(f.featureId))
        applyHighlight(selectedIds)
        if (selectedIds.length === 0 && tooltip) {
          hideTooltip(tooltip)
        }
        this.dispatchEvent(new CustomEvent(EVENT_SELECTION, { bubbles: true, detail: { selectedIds } }))
      }
    )
  }
}

/**
 * Resolves the MapLibre style URL/attribution for the chosen basemap
 * provider.
 * TEMPORARY (TGC-1418 follow-up): once the OpenStreetMap comparison is
 * removed, this collapses to always returning the OS Maps style — delete
 * the ternary and this function's `provider` param.
 * @param {string} provider  BASEMAP_PROVIDER_ORDNANCE_SURVEY | BASEMAP_PROVIDER_OPENSTREETMAP
 * @returns {{ url: string, attribution: string }}
 */
function getMapStyle(provider) {
  // OSM's style/tiles are public (no key to protect), so its URL points
  // straight at CartoCDN; OS Maps stays server-proxied.
  return provider === BASEMAP_PROVIDER_OPENSTREETMAP
    ? { url: OSM_STYLE_URL, attribution: OSM_STYLE_ATTRIBUTION }
    : { url: MAP_STYLE_URL, attribution: getMapStyleAttribution() }
}

/**
 * Makes parcels easier to click when they're small on screen.
 *
 * The interact plugin already searches a PARCEL_CLICK_TOLERANCE_PX box around
 * the click, but for polygons it only counts a hit if the click lands exactly
 * inside the shape — near-misses are dropped. That's nearly guaranteed for a
 * parcel that's only a few pixels wide when zoomed out. When the strict check
 * finds nothing, this falls back to whatever parcel is *drawn* closest to the
 * click within that same box. Adjacent (not overlapping) small parcels can
 * both land in that box at low zoom, so this picks whichever one is nearest
 * to the click rather than an arbitrary one. Covers both mouse clicks and the
 * keyboard crosshair, at any zoom.
 *
 * The odd wrapping is because the map library hands us a *descriptor*, not
 * the provider itself — its `load()` creates the provider later — so we
 * intercept `load()` to subclass the provider once it exists.
 * @param {{ load: () => Promise<{ MapProvider: new (...args: never[]) => { map?: import('maplibre-gl').Map } }> }} descriptor
 */
function withParcelHitTolerance(descriptor) {
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
function nearestFeatureToPoint(map, point, features) {
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
function getScreenBounds(map, feature) {
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
function buildSkeleton() {
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
function buildColorExpr(ids) {
  const expr = /** @type {unknown[]} */ (['match', COMPOUND_ID_EXPR])
  ;[...new Set(ids)].forEach((id, i) => {
    expr.push(id, PARCEL_COLORS[i % PARCEL_COLORS.length])
  })
  expr.push(PARCEL_COLORS[0])
  return expr
}

/**
 * Read the compound parcel ID (e.g. "SD7148-9160") off a MapLibre feature's
 * `id` property — the same property the interact plugin matches selections
 * against (PARCEL_ID_PROPERTY).
 * @param {MapGeoJSONFeature} feature
 * @returns {string}
 */
function resolveFeatureId(feature) {
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
function showTooltip(tooltip, id, props, x, y, mapEl) {
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
function hideTooltip(tooltip) {
  tooltip.style.display = 'none'
}

/** @param {string} value @returns {string} */
function htmlEncode(value) {
  const text = document.createTextNode(value)
  const div = document.createElement('div')
  div.appendChild(text)
  return div.innerHTML
}

if (!customElements.get('parcel-map')) {
  customElements.define('parcel-map', ParcelMap)
}
