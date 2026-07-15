/* eslint-disable no-console */
// @ts-ignore — no type declarations shipped with this package
import InteractiveMap from '@defra/interactive-map'
// @ts-ignore — no type declarations shipped with this package
import maplibreProvider from '@defra/interactive-map/providers/maplibre'
// @ts-ignore — no type declarations shipped with this package
import createInteractPlugin from '@defra/interactive-map/plugins/interact'
// TEMPORARY (TGC-1418 follow-up): delete this import and its one call site
// (marked "metrics:" below) along with basemap-metrics.js.
import { trackBasemapMetrics } from './basemap-metrics.js'
import {
  COMPOUND_ID_EXPR,
  buildParcelLayers,
  getMapStyle,
  withParcelHitTolerance,
  buildSkeleton,
  buildColorExpr,
  resolveFeatureId,
  showTooltip,
  hideTooltip
} from './map-helpers.js'
import {
  PARCELS_API_URL,
  PARCEL_TILES_URL,
  PARCELS_GEOJSON_URL,
  MAP_LABEL,
  BASEMAP_PROVIDER_ATTRIBUTE,
  BASEMAP_METRICS_ATTRIBUTE,
  DEFAULT_BASEMAP_PROVIDER,
  // TEMPORARY: OS Maps vs OpenStreetMap comparison (TGC-1418 follow-up) — see config.js
  BASEMAP_PROVIDER_OPENSTREETMAP,
  PARCEL_ID_PROPERTY,
  SOURCE_ID_PARCELS,
  LAYER_ID_FILL,
  FIT_BOUNDS_PADDING,
  TOOLTIP_STYLES,
  TAG_NAME,
  MAP_DEFAULT_HEIGHT,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_MIN_ZOOM,
  MAP_LOAD_TIMEOUT_MS,
  FETCH_MAX_ATTEMPTS,
  FETCH_RETRY_DELAY_MS,
  EVENT_READY,
  EVENT_ERROR,
  EVENT_SELECTION,
  ERROR_REASON_UNAVAILABLE,
  ERROR_REASON_NO_PARCELS,
  STATE_IDLE,
  STATE_LOADING,
  STATE_READY,
  STATE_ERROR,
  MULTI_SELECT_ATTRIBUTE,
  ERROR_OVERLAY_STYLES,
  ERROR_LABEL_STYLES,
  FILL_OPACITY_DEFAULT,
  FILL_OPACITY_SELECTED,
  SELECTION_NONE_SENTINEL,
  MSG_ERROR_UNAVAILABLE
} from './config.js'

/**
 * @import { Map as MLMap } from 'maplibre-gl'
 * @import { ParcelProperties, MetaIndex } from './map-helpers.js'
 */

/**
 * @typedef {{ parcelIds: string[], metaIndex: MetaIndex, geojsonUrl: string | null, bbox: BBox | null }} ParcelData
 * @typedef {{ minLng: number, minLat: number, maxLng: number, maxLat: number }} BBox
 */

// <parcel-map multi-select="true|false" basemap-provider="ordnance-survey|openstreetmap" basemap-metrics="true|false">
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

  // Set when basemap-provider changes while a load is already in flight —
  // the in-flight #init() already captured the old value in a local const,
  // so it can't pick up the new one itself. #init() checks this once it
  // settles and restarts itself if needed.
  #pendingReinit = false

  static get observedAttributes() {
    return [BASEMAP_PROVIDER_ATTRIBUTE]
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
    // Ignore the attribute's own initial set before the element is connected.
    if (name !== BASEMAP_PROVIDER_ATTRIBUTE || !this.#connected) {
      return
    }
    if (this.#state === STATE_LOADING) {
      this.#pendingReinit = true
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
    const multiSelect = this.getAttribute(MULTI_SELECT_ATTRIBUTE) === 'true'
    const basemapProvider = this.getAttribute(BASEMAP_PROVIDER_ATTRIBUTE) || DEFAULT_BASEMAP_PROVIDER

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
      this.dispatchEvent(new CustomEvent(EVENT_ERROR, { bubbles: true, detail: { reason: ERROR_REASON_UNAVAILABLE } }))
    } else if (data.parcelIds.length === 0) {
      this.#teardown()
      this.#state = STATE_ERROR
      this.dispatchEvent(new CustomEvent(EVENT_ERROR, { bubbles: true, detail: { reason: ERROR_REASON_NO_PARCELS } }))
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

    // basemap-provider changed while the load above was in flight — restart
    // now that we've settled, so the map ends up on the current attribute
    // value instead of the one captured at the top of this #init() call.
    if (this.#pendingReinit) {
      this.#pendingReinit = false
      this.#teardown()
      this.#state = STATE_IDLE
      this.#init()
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
        minZoom: basemapProvider === BASEMAP_PROVIDER_OPENSTREETMAP ? undefined : MAP_MIN_ZOOM,
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

        if (this.getAttribute(BASEMAP_METRICS_ATTRIBUTE) === 'true') {
          this.#mlCleanup.push(trackBasemapMetrics(m, basemapProvider, this))
        }
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
          return await this.#parseParcelResponse(resp)
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

    if (ml.getSource(SOURCE_ID_PARCELS)) {
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
    ml.addSource(SOURCE_ID_PARCELS, source)
    const layers = buildParcelLayers(colorExpr, geojsonUrl ? undefined : SOURCE_ID_PARCELS, basemapProvider)
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

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, ParcelMap)
}
