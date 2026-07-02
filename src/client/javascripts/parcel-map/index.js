// @ts-ignore — no type declarations shipped with this package
import InteractiveMap from '@defra/interactive-map'
// @ts-ignore — no type declarations shipped with this package
import maplibreProvider from '@defra/interactive-map/providers/maplibre'
import {
  PARCELS_API_URL,
  MAP_STYLE_URL,
  MAP_STYLE_ATTRIBUTION,
  PARCEL_COLORS,
  LAYER_TEXT_SIZE,
  LAYER_TEXT_HALO_WIDTH,
  TOOLTIP_STYLES,
  LAYER_ID_FILL,
  LAYER_ID_OUTLINE,
  LAYER_ID_LABEL,
  FILL_OPACITY_DEFAULT,
  FILL_OPACITY_SELECTED,
  MAP_DEFAULT_HEIGHT,
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
  MSG_ERROR_NO_PARCELS,
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
 * @typedef {{ parcelIds: string[], metaIndex: MetaIndex, tileUrl: string | null, geojsonUrl: string | null, bbox: BBox | null }} ParcelData
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
        'line-width': 1.5
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
  _state = STATE_IDLE

  /** @type {InstanceType<typeof InteractiveMap> | null} */
  _mapInstance = null

  /** @type {HTMLDivElement | null} */
  _mapEl = null

  /** @type {HTMLDivElement | null} */
  _skeleton = null

  /** @type {MLMap | null} */
  _ml = null

  /** @type {Array<() => void>} */
  _mlCleanup = []

  _connected = false

  static get observedAttributes() {
    return ['multi-select']
  }

  connectedCallback() {
    this._connected = true
    this._state = STATE_IDLE
    this._init()
  }

  attributeChangedCallback() {
    if (!this._connected) {
      return
    }
    if (this._state !== STATE_IDLE) {
      this._teardown()
      this._init()
    }
  }

  disconnectedCallback() {
    this._teardown()
  }

  _teardown() {
    this._state = STATE_IDLE
    for (const off of this._mlCleanup) { off() }
    this._mlCleanup = []
    this._ml = null
    try {
      this._mapInstance?.destroy?.()
    } catch {
      /* ignore */
    }
    this._mapInstance = null
    this._mapEl?.parentElement?.remove()
    this._mapEl = null
    this._skeleton?.remove()
    this._skeleton = null
  }

  async _init() {
    this._state = STATE_LOADING

    const multiSelect = this.getAttribute('multi-select') === 'true'

    this._skeleton = buildSkeleton()
    this.appendChild(this._skeleton)

    const [ml, data] = await Promise.all([this._initMap(), this._fetchData()])

    if (this._state !== STATE_LOADING) {
      return
    }

    if (!ml || !data) {
      this._state = STATE_ERROR
      this._teardown()
      this._showError(MSG_ERROR_UNAVAILABLE)
      this.dispatchEvent(new CustomEvent(EVENT_ERROR, { bubbles: true, detail: { reason: 'unavailable' } }))
      return
    }

    if (data.parcelIds.length === 0) {
      this._state = STATE_ERROR
      this._teardown()
      this._showError(MSG_ERROR_NO_PARCELS)
      this.dispatchEvent(new CustomEvent(EVENT_ERROR, { bubbles: true, detail: { reason: 'no-parcels' } }))
      return
    }

    this._ml = ml
    const colorExpr = buildColorExpr(data.parcelIds)
    this._addParcelsToMap(ml, data, colorExpr)
    const tooltip = this._attachTooltip(ml, data.metaIndex)
    this._attachSelectionHandler(ml, multiSelect, tooltip)

    this._state = STATE_READY
    this._skeleton?.remove()
    this._skeleton = null

    this.dispatchEvent(new CustomEvent(EVENT_READY, { bubbles: true }))
  }

  /** @param {string} message */
  _showError(message) {
    const el = document.createElement('div')
    el.setAttribute('role', 'alert')
    el.style.cssText = ERROR_OVERLAY_STYLES
    const label = document.createElement('span')
    label.style.cssText = ERROR_LABEL_STYLES
    label.textContent = message
    el.appendChild(label)
    this.appendChild(el)
  }

  /** @returns {Promise<MLMap | null>} */
  _initMap() {
    return new Promise((resolve) => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'position:relative;width:100%;height:100%'

      const mapEl = /** @type {HTMLDivElement} */ (document.createElement('div'))
      mapEl.id = `parcel-map-${crypto.randomUUID()}`
      mapEl.style.cssText = 'width:100%;height:100%'
      wrapper.appendChild(mapEl)
      this._mapEl = mapEl

      if (this._skeleton) {
        this.insertBefore(wrapper, this._skeleton)
      } else {
        this.appendChild(wrapper)
      }

      // Clear stale viewport params so InteractiveMap doesn't restore an old view
      const url = new URL(globalThis.location.href)
      url.searchParams.delete(`${mapEl.id}:center`)
      url.searchParams.delete(`${mapEl.id}:zoom`)
      globalThis.history.replaceState(null, '', url)

      const map = new InteractiveMap(mapEl.id, {
        behaviour: 'inline',
        containerHeight: this.style.height || MAP_DEFAULT_HEIGHT,
        mapProvider: maplibreProvider(),
        mapStyle: { url: MAP_STYLE_URL, attribution: MAP_STYLE_ATTRIBUTION }
      })
      this._mapInstance = map

      map.on('map:error', () => resolve(null))

      const timeout = globalThis.setTimeout(() => resolve(null), MAP_LOAD_TIMEOUT_MS)

      // map:ready gives us the raw MapLibre instance; map:stylechange is the
      // earliest point addSource/addLayer can safely be called.
      /** @type {MLMap | null} */
      let mlInstance = null
      map.on('map:ready', (/** @type {{ map: MLMap }} */ { map: m }) => {
        mlInstance = m
        // Also catch native MapLibre errors (e.g. style fetch failure) which
        // @defra/interactive-map does not surface as map:error.
        m.on('error', () => {
          globalThis.clearTimeout(timeout)
          resolve(null)
        })
      })
      map.on('map:stylechange', () => {
        if (mlInstance && this._state === STATE_LOADING) {
          globalThis.clearTimeout(timeout)
          resolve(mlInstance)
        }
      })
    })
  }

  /** @returns {Promise<ParcelData | null>} */
  async _fetchData() {
    for (let attempt = 0; attempt < FETCH_MAX_ATTEMPTS; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((resolve) => globalThis.setTimeout(resolve, FETCH_RETRY_DELAY_MS))
        }
        const resp = await fetch(PARCELS_API_URL)
        if (!resp.ok) {
          if (attempt < FETCH_MAX_ATTEMPTS - 1) { continue }
          return null
        }

        /** @type {{ features: GeoJSON.Feature[], bbox: BBox | null, tileUrl: string | null, geojsonUrl: string | null }} */
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
          tileUrl: body.tileUrl ?? null,
          geojsonUrl: body.geojsonUrl ?? null,
          bbox: body.bbox ?? null
        }
      } catch {
        if (attempt < FETCH_MAX_ATTEMPTS - 1) { continue }
        return null
      }
    }
    return null
  }

  /**
   * @param {MLMap} ml
   * @param {ParcelData} data
   * @param {unknown[]} colorExpr
   */
  _addParcelsToMap(ml, { tileUrl, geojsonUrl, bbox }, colorExpr) {
    if (bbox) {
      const { minLng, minLat, maxLng, maxLat } = bbox
      ml.fitBounds(
        [
          [Number(minLng), Number(minLat)],
          [Number(maxLng), Number(maxLat)]
        ],
        { padding: 40, animate: false }
      )
    }

    if (ml.getSource('parcels')) {
      return
    }

    const url = geojsonUrl ?? tileUrl
    if (!url) {
      return
    }
    const absoluteUrl = url.startsWith('http') ? url : `${globalThis.location.origin}${url}`
    if (geojsonUrl) {
      ml.addSource(
        'parcels',
        /** @type {import('maplibre-gl').GeoJSONSourceSpecification} */ ({ type: 'geojson', data: absoluteUrl })
      )
    } else {
      ml.addSource(
        'parcels',
        /** @type {import('maplibre-gl').VectorSourceSpecification} */ ({ type: 'vector', tiles: [absoluteUrl] })
      )
    }
    const layers = buildParcelLayers(colorExpr, geojsonUrl ? undefined : 'parcels')
    ml.addLayer(/** @type {import('maplibre-gl').LayerSpecification} */ (layers.fill))
    ml.addLayer(/** @type {import('maplibre-gl').LayerSpecification} */ (layers.outline))
    ml.addLayer(/** @type {import('maplibre-gl').LayerSpecification} */ (layers.label))
  }

  /**
   * @param {MLMap} ml
   * @param {MetaIndex} metaIndex
   */
  _attachTooltip(ml, metaIndex) {
    const wrapper = this._mapEl?.parentElement
    if (!wrapper) {
      return undefined
    }

    const tooltip = document.createElement('div')
    tooltip.setAttribute('role', 'tooltip')
    tooltip.setAttribute('aria-live', 'polite')
    tooltip.style.cssText = TOOLTIP_STYLES
    wrapper.appendChild(tooltip)

    const onTooltipClick = (/** @type {import('maplibre-gl').MapMouseEvent & { features?: import('maplibre-gl').MapGeoJSONFeature[] }} */ e) => {
      const feature = e.features?.[0]
      if (!feature) { return }
      const id = resolveFeatureId(feature)
      const props = /** @type {ParcelProperties} */ ({ ...feature.properties, ...metaIndex[id] })
      const point = ml.project(e.lngLat)
      showTooltip(tooltip, id, props, point.x, point.y, this._mapEl)
    }
    const onMapClick = (/** @type {import('maplibre-gl').MapMouseEvent} */ e) => {
      if (ml.getLayer(LAYER_ID_FILL) && ml.queryRenderedFeatures(e.point, { layers: [LAYER_ID_FILL] }).length === 0) {
        hideTooltip(tooltip)
      }
    }
    const onMouseEnter = () => { ml.getCanvas().style.cursor = 'pointer' }
    const onMouseLeave = () => { ml.getCanvas().style.cursor = '' }

    ml.on('click', LAYER_ID_FILL, onTooltipClick)
    ml.on('click', onMapClick)
    ml.on('mouseenter', LAYER_ID_FILL, onMouseEnter)
    ml.on('mouseleave', LAYER_ID_FILL, onMouseLeave)

    this._mlCleanup.push(
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
  _attachSelectionHandler(ml, multiSelect, tooltip) {
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

    const onParcelClick = (/** @type {import('maplibre-gl').MapMouseEvent & { features?: import('maplibre-gl').MapGeoJSONFeature[] }} */ e) => {
      const feature = e.features?.[0]
      if (!feature) { return }
      const id = resolveFeatureId(feature)
      if (!id) { return }

      if (multiSelect) {
        const wasSelected = selected.has(id)
        wasSelected ? selected.delete(id) : selected.add(id)
        if (wasSelected && tooltip) { hideTooltip(tooltip) }
      } else {
        const alreadySelected = selected.has(id)
        selected.clear()
        if (!alreadySelected) {
          selected.add(id)
        } else if (tooltip) {
          hideTooltip(tooltip)
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

    this._mlCleanup.push(
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
          <td>${areaHa == null ? MSG_UNKNOWN_AREA : htmlEncode(areaHa.toFixed(2) + ' ha')}</td></tr>
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
