/* eslint-disable no-console */
// @ts-ignore — no type declarations shipped with this package
import InteractiveMap from '@defra/interactive-map'
// @ts-ignore — no type declarations shipped with this package
import maplibreProvider from '@defra/interactive-map/providers/maplibre'
import {
  PARCELS_API_URL,
  PARCEL_TILES_URL,
  PARCELS_GEOJSON_URL,
  MAP_STYLE_URL,
  getMapStyleAttribution,
  PARCEL_COLORS,
  LAYER_TEXT_SIZE,
  LAYER_TEXT_HALO_WIDTH,
  LAYER_LINE_WIDTH,
  FIT_BOUNDS_PADDING,
  AREA_DECIMAL_PLACES,
  TOOLTIP_STYLES,
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

/**
 * @param {unknown[]} colorExpr  MapLibre `match` expression
 * @param {string}   [sourceLayer]
 */
function buildParcelLayers(colorExpr, sourceLayer) {
  const src = sourceLayer ? { 'source-layer': sourceLayer } : {}
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
        'text-field': ['concat', ['get', 'sheet_id'], '-', ['get', 'parcel_id']],
        'text-font': ['Arial Regular'],
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

// <parcel-map multi-select="true|false">
// Height via CSS on the element. Dispatches:
//   parcel-map:ready, parcel-map:error, parcel-map:selection → { selectedIds: string[] }
class ParcelMap extends HTMLElement {
  /** @type {typeof STATE_IDLE | typeof STATE_LOADING | typeof STATE_READY | typeof STATE_ERROR} */
  #state = STATE_IDLE

  /** @type {InstanceType<typeof InteractiveMap> | null} */
  #mapInstance = null

  /** @type {HTMLDivElement | null} */
  #mapEl = null

  /** @type {HTMLDivElement | null} */
  #skeleton = null

  /** @type {HTMLDivElement | null} */
  #errorOverlay = null

  /** @type {Array<() => void>} */
  #mlCleanup = []

  connectedCallback() {
    this.#state = STATE_IDLE
    this.#init()
  }

  disconnectedCallback() {
    this.#teardown()
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
    this.#mapEl?.parentElement?.remove()
    this.#mapEl = null
    this.#skeleton?.remove()
    this.#skeleton = null
    this.#errorOverlay?.remove()
    this.#errorOverlay = null
  }

  async #init() {
    this.#state = STATE_LOADING

    // Read once at connect, runtime changes to the attribute are not supported.
    const multiSelect = this.getAttribute('multi-select') === 'true'

    this.#skeleton = buildSkeleton()
    this.appendChild(this.#skeleton)

    const [ml, data] = await Promise.all([this.#initMap(), this.#fetchData()])

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
      this.#addParcelsToMap(ml, data, colorExpr)
      const tooltip = this.#attachTooltip(ml, data.metaIndex)
      this.#attachSelectionHandler(ml, multiSelect, tooltip)

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

  /** @returns {Promise<MLMap | null>} */
  #initMap() {
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

      const map = new InteractiveMap(mapEl.id, {
        behaviour: 'inline',
        containerHeight: this.style.height || MAP_DEFAULT_HEIGHT,
        mapProvider: maplibreProvider(),
        mapStyle: { url: MAP_STYLE_URL, attribution: getMapStyleAttribution() },
        center: MAP_DEFAULT_CENTER,
        zoom: MAP_DEFAULT_ZOOM,
        // The OS basemap has no tiles below z7 — stop users zooming out into
        // blank void. Passed through to the MapLibre Map constructor.
        minZoom: MAP_MIN_ZOOM,
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
   */
  #addParcelsToMap(ml, { geojsonUrl, bbox }, colorExpr) {
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
    const layers = buildParcelLayers(colorExpr, geojsonUrl ? undefined : 'parcels')
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
   * @param {MLMap} ml
   * @param {boolean} multiSelect
   * @param {HTMLElement | undefined} tooltip
   */
  #attachSelectionHandler(ml, multiSelect, tooltip) {
    /** @type {Set<string>} */
    const selected = new Set()
    const idExpr = ['concat', ['get', 'sheet_id'], '-', ['get', 'parcel_id']]

    const applySelection = () => {
      const matchList = selected.size > 0 ? [...selected] : [SELECTION_NONE_SENTINEL]
      ml.setPaintProperty(LAYER_ID_FILL, 'fill-opacity', [
        'match',
        idExpr,
        matchList,
        FILL_OPACITY_SELECTED,
        FILL_OPACITY_DEFAULT
      ])
    }

    const onParcelClick = (
      /** @type {import('maplibre-gl').MapMouseEvent & { features?: import('maplibre-gl').MapGeoJSONFeature[] }} */ e
    ) => {
      const feature = e.features?.[0]
      if (!feature) {
        return
      }
      const id = resolveFeatureId(feature)
      if (!id) {
        return
      }

      if (multiSelect) {
        const wasSelected = selected.has(id)
        wasSelected ? selected.delete(id) : selected.add(id)
        if (wasSelected && tooltip) {
          hideTooltip(tooltip)
        }
      } else {
        const alreadySelected = selected.has(id)
        selected.clear()
        if (!alreadySelected) {
          selected.add(id)
        } else if (tooltip) {
          hideTooltip(tooltip)
        } else {
          // parcel deselected and no tooltip to hide
        }
      }

      applySelection()
      this.dispatchEvent(new CustomEvent(EVENT_SELECTION, { bubbles: true, detail: { selectedIds: [...selected] } }))
    }

    const onDeselect = (/** @type {import('maplibre-gl').MapMouseEvent} */ e) => {
      if (ml.getLayer(LAYER_ID_FILL) && ml.queryRenderedFeatures(e.point, { layers: [LAYER_ID_FILL] }).length === 0) {
        selected.clear()
        applySelection()
        this.dispatchEvent(new CustomEvent(EVENT_SELECTION, { bubbles: true, detail: { selectedIds: [] } }))
      }
    }

    ml.on('click', LAYER_ID_FILL, onParcelClick)
    ml.on('click', onDeselect)

    this.#mlCleanup.push(
      () => ml.off('click', LAYER_ID_FILL, onParcelClick),
      () => ml.off('click', onDeselect)
    )
  }
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
  const expr = /** @type {unknown[]} */ (['match', ['concat', ['get', 'sheet_id'], '-', ['get', 'parcel_id']]])
  ;[...new Set(ids)].forEach((id, i) => {
    expr.push(id, PARCEL_COLORS[i % PARCEL_COLORS.length])
  })
  expr.push(PARCEL_COLORS[0])
  return expr
}

/**
 * Derive the compound parcel ID (e.g. "SD7148-9160") from a MapLibre vector tile feature.
 * @param {MapGeoJSONFeature} feature
 * @returns {string}
 */
function resolveFeatureId(feature) {
  const p = /** @type {ParcelProperties} */ (feature.properties ?? {})
  const sheet = typeof p.sheet_id === 'string' || typeof p.sheet_id === 'number' ? String(p.sheet_id) : ''
  const parcel = typeof p.parcel_id === 'string' || typeof p.parcel_id === 'number' ? String(p.parcel_id) : ''
  return sheet && parcel ? `${sheet}-${parcel}` : ''
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
