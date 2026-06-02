// @ts-ignore — no type declarations shipped with this package
import InteractiveMap from '@defra/interactive-map'
// @ts-ignore
import maplibreProvider from '@defra/interactive-map/providers/maplibre'
import {
  PARCELS_API_URL,
  MAP_STYLE_URL,
  MAP_STYLE_ATTRIBUTION,
  PARCEL_COLORS,
  LAYER_TEXT_SIZE,
  LAYER_TEXT_HALO_WIDTH,
  TOOLTIP_STYLES
} from './config.js'

/**
 * @import { Map as MLMap, MapGeoJSONFeature } from 'maplibre-gl'
 */

/**
 * @typedef {{ sheet_id?: unknown, parcel_id?: unknown, areaHa?: unknown, [key: string]: unknown }} ParcelProperties
 * @typedef {{ id: string } & ParcelProperties} ParcelMeta
 * @typedef {Record<string, ParcelMeta>} MetaIndex
 * @typedef {{ parcelIds: string[], metaIndex: MetaIndex, tileUrl: string | null, bbox: BBox | null }} ParcelData
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
      id: 'parcels-fill',
      type: 'fill',
      source: 'parcels',
      ...src,
      paint: {
        'fill-color': colorExpr,
        'fill-opacity': 0.2
      }
    },
    outline: {
      id: 'parcels-outline',
      type: 'line',
      source: 'parcels',
      ...src,
      paint: {
        'line-color': colorExpr,
        'line-width': 1.5
      }
    },
    label: {
      id: 'parcels-label',
      type: 'symbol',
      source: 'parcels',
      ...src,
      layout: {
        'text-field': ['concat', ['get', 'sheet_id'], '-', ['get', 'parcel_id']],
        'text-size': LAYER_TEXT_SIZE,
        'text-anchor': 'center'
      },
      paint: {
        'text-color': '#0b0c0c',
        'text-halo-color': '#ffffff',
        'text-halo-width': LAYER_TEXT_HALO_WIDTH
      }
    }
  }
}

// <parcel-map multi-select="true|false">
// Height via CSS on the element. Dispatches:
//   parcel-map:ready, parcel-map:error, parcel-map:selection → { selectedIds: string[] }
class ParcelMap extends HTMLElement {
  /** @type {'idle' | 'loading' | 'ready' | 'error'} */
  _state = 'idle'

  /** @type {InstanceType<typeof InteractiveMap> | null} */
  _mapInstance = null

  /** @type {HTMLDivElement | null} */
  _mapEl = null

  /** @type {HTMLDivElement | null} */
  _skeleton = null

  static get observedAttributes() {
    return ['multi-select']
  }

  connectedCallback() {
    this._connected = true
    this._state = 'idle'
    this._init()
  }

  attributeChangedCallback() {
    if (!this._connected) {
      return
    }
    if (this._state !== 'idle') {
      this._teardown()
      this._init()
    }
  }

  disconnectedCallback() {
    this._teardown()
  }

  _teardown() {
    this._state = 'idle'
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
    this._state = 'loading'

    const multiSelect = this.getAttribute('multi-select') === 'true'

    this._skeleton = buildSkeleton()
    this.appendChild(this._skeleton)

    const [ml, data] = await Promise.all([this._initMap(), this._fetchData()])

    if (this._state !== 'loading') {
      return
    }

    if (!ml || !data) {
      this._state = 'error'
      this._teardown()
      this.dispatchEvent(new CustomEvent('parcel-map:error', { bubbles: true }))
      return
    }

    const colorExpr = buildColorExpr(data.parcelIds)
    this._addParcelsToMap(ml, data, colorExpr)
    const tooltip = this._attachTooltip(ml, data.metaIndex)
    this._attachSelectionHandler(ml, multiSelect, tooltip, colorExpr)

    this._state = 'ready'
    this._skeleton?.remove()
    this._skeleton = null

    this.dispatchEvent(new CustomEvent('parcel-map:ready', { bubbles: true }))
  }

  /** @returns {Promise<MLMap | null>} */
  _initMap() {
    return new Promise((resolve) => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'position:relative;width:100%;height:100%'

      const mapEl = /** @type {HTMLDivElement} */ (document.createElement('div'))
      mapEl.id = `parcel-map-${Math.random().toString(36).slice(2)}`
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
        containerHeight: this.style.height || '500px',
        mapProvider: maplibreProvider(),
        mapStyle: { url: MAP_STYLE_URL, attribution: MAP_STYLE_ATTRIBUTION }
      })
      this._mapInstance = map

      map.on('map:error', () => resolve(null))

      // map:ready gives us the raw MapLibre instance; map:stylechange is the
      // earliest point addSource/addLayer can safely be called.
      /** @type {MLMap | null} */
      let mlInstance = null
      map.on('map:ready', (/** @type {{ map: MLMap }} */ { map: m }) => {
        mlInstance = m
      })
      map.on('map:stylechange', () => {
        if (mlInstance && this._state === 'loading') {
          resolve(mlInstance)
        }
      })
    })
  }

  /** @returns {Promise<ParcelData | null>} */
  async _fetchData() {
    try {
      const resp = await fetch(PARCELS_API_URL)
      if (!resp.ok) {
        return null
      }

      /** @type {{ features: GeoJSON.Feature[], bbox: BBox | null, tileUrl: string | null }} */
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

      return { parcelIds, metaIndex, tileUrl: body.tileUrl ?? null, bbox: body.bbox ?? null }
    } catch {
      return null
    }
  }

  /**
   * @param {MLMap} ml
   * @param {ParcelData} data
   * @param {unknown[]} colorExpr
   */
  _addParcelsToMap(ml, { tileUrl, bbox }, colorExpr) {
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

    if (!tileUrl || ml.getSource('parcels')) {
      return
    }

    const absoluteUrl = tileUrl.startsWith('http') ? tileUrl : `${globalThis.location.origin}${tileUrl}`
    ml.addSource(
      'parcels',
      /** @type {import('maplibre-gl').VectorSourceSpecification} */ ({ type: 'vector', tiles: [absoluteUrl] })
    )

    const layers = buildParcelLayers(colorExpr, 'parcels')
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
      return
    }

    const tooltip = document.createElement('div')
    tooltip.setAttribute('role', 'tooltip')
    tooltip.setAttribute('aria-live', 'polite')
    tooltip.style.cssText = TOOLTIP_STYLES
    wrapper.appendChild(tooltip)

    ml.on('click', 'parcels-fill', (e) => {
      const feature = e.features?.[0]
      if (!feature) {
        return
      }
      const id = resolveFeatureId(feature)
      const props = /** @type {ParcelProperties} */ ({ ...feature.properties, ...metaIndex[id] })
      const point = ml.project(e.lngLat)
      showTooltip(tooltip, id, props, point.x, point.y, this._mapEl)
    })

    ml.on('click', (e) => {
      if (ml.getLayer('parcels-fill') && ml.queryRenderedFeatures(e.point, { layers: ['parcels-fill'] }).length === 0) {
        hideTooltip(tooltip)
      }
    })

    ml.on('mouseenter', 'parcels-fill', () => {
      ml.getCanvas().style.cursor = 'pointer'
    })
    ml.on('mouseleave', 'parcels-fill', () => {
      ml.getCanvas().style.cursor = ''
    })

    return tooltip
  }

  /**
   * @param {MLMap} ml
   * @param {boolean} multiSelect
   * @param {HTMLElement | undefined} tooltip
   * @param {unknown[]} colorExpr
   */
  _attachSelectionHandler(ml, multiSelect, tooltip, colorExpr) {
    /** @type {Set<string>} */
    const selected = new Set()
    const idExpr = ['concat', ['get', 'sheet_id'], '-', ['get', 'parcel_id']]

    const applySelection = () => {
      const matchList = selected.size > 0 ? [...selected] : ['__none__']
      ml.setPaintProperty('parcels-fill', 'fill-opacity', ['match', idExpr, matchList, 0.5, 0.2])
    }

    ml.on('click', 'parcels-fill', (e) => {
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
        }
      }

      applySelection()

      this.dispatchEvent(
        new CustomEvent('parcel-map:selection', {
          bubbles: true,
          detail: { selectedIds: [...selected] }
        })
      )
    })

    ml.on('click', (e) => {
      if (ml.getLayer('parcels-fill') && ml.queryRenderedFeatures(e.point, { layers: ['parcels-fill'] }).length === 0) {
        selected.clear()
        applySelection()
        this.dispatchEvent(
          new CustomEvent('parcel-map:selection', {
            bubbles: true,
            detail: { selectedIds: [] }
          })
        )
      }
    })
  }
}

/** @returns {HTMLDivElement} */
function buildSkeleton() {
  const el = /** @type {HTMLDivElement} */ (document.createElement('div'))
  el.setAttribute('aria-label', 'Loading map…')
  el.setAttribute('role', 'status')
  el.style.cssText = [
    'position:absolute',
    'inset:0',
    'background:#f3f2f1',
    'border:2px solid #b1b4b6',
    'border-radius:4px',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'z-index:1'
  ].join(';')
  const label = document.createElement('span')
  label.style.cssText = 'font-family:GDS Transport,arial,sans-serif;font-size:16px;color:#505a5f'
  label.textContent = 'Loading map…'
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
  const sheet = p.sheet_id == null ? '' : String(p.sheet_id)
  const parcel = p.parcel_id == null ? '' : String(p.parcel_id)
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
    <strong style="display:block;margin-bottom:8px;font-size:15px">${escapeHtml(id || 'Unknown parcel')}</strong>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="color:#505a5f;padding:2px 12px 2px 0;white-space:nowrap">Total area</td>
          <td>${areaHa == null ? 'Unknown' : escapeHtml(areaHa.toFixed(2) + ' ha')}</td></tr>
    </table>`
  tooltip.style.left = `${Math.min(x + 12, (mapEl?.offsetWidth ?? 500) - 248)}px`
  tooltip.style.top = `${y - 10}px`
  tooltip.style.display = 'block'
}

/** @param {HTMLElement} tooltip */
function hideTooltip(tooltip) {
  tooltip.style.display = 'none'
}

/** @param {string} value @returns {string} */
function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

if (!customElements.get('parcel-map')) {
  customElements.define('parcel-map', ParcelMap)
}
