// @ts-nocheck — @defra/interactive-map is an alpha package with no type declarations
import InteractiveMap from '@defra/interactive-map'
import maplibreProvider from '@defra/interactive-map/providers/maplibre'
import interact from '@defra/interactive-map/plugins/interact'

// Vector tile endpoint — when set, parcel geometry is loaded from the tile server
// instead of the server-generated GeoJSON. Set to null to use GeoJSON fallback.
const PARCEL_TILE_URL = `${window.location.origin}/land-grants/parcel-tiles/{z}/{x}/{y}`
const PARCEL_TILE_SOURCE_LAYER = 'parcels'

// Must match PARCEL_COLOURS in the server controller so colours are consistent
const PARCEL_COLOURS = ['#1d70b8', '#d4351c', '#f47738', '#4c2c92', '#005a30', '#28a197', '#b58840']

// Mock land-cover data — in production this would come from the API
const MOCK_LAND_COVER = {
  default: 'Arable land'
}

/**
 * Build a MapLibre `match` expression mapping "sheetId-parcelId" → colour.
 * Uses concat of sheet_id + parcel_id as the input key — both properties are
 * present on vector tile features. IDs are deduped before building the expression
 * to avoid the "branch labels must be unique" MapLibre error.
 * @param {string[]} ids  e.g. ['SD6052-8856', 'SD6052-8857', …]
 * @returns {unknown[]}
 */
function buildColorMatchExpression(ids) {
  const uniqueIds = [...new Set(ids)]
  const expr = ['match', ['concat', ['get', 'sheet_id'], '-', ['get', 'parcel_id']]]
  uniqueIds.forEach((fullId, i) => {
    expr.push(fullId, PARCEL_COLOURS[i % PARCEL_COLOURS.length])
  })
  expr.push(PARCEL_COLOURS[0]) // fallback
  return expr
}

function init() {
  const container = document.getElementById('parcel-map')
  if (!container) return

  const parcelIds = JSON.parse(container.dataset.parcelIds ?? '[]')
  const tileLocation = JSON.parse(container.dataset.tileLocation ?? 'null')
  const selectedInputsContainer = document.getElementById('selected-parcels-inputs')

  // Parcel metadata from server — area and actions count keyed by full parcel ID.
  // Vector tile features only carry sheet_id/parcel_id so this is the tooltip data source.
  /** @type {Record<string, { areaHa: number | null, actionsCount: number }>} */
  const parcelMeta = Object.fromEntries(
    /** @type {Array<{id: string, areaHa: number | null, actionsCount: number}>} */
    (JSON.parse(container.dataset.parcelMeta ?? '[]')).map((m) => [m.id, { areaHa: m.areaHa, actionsCount: m.actionsCount }])
  )

  /** @type {object | null} */
  let maplibre = null

  // Keep a reference to the plugin descriptor — the core binds api methods (enable, disable, etc.)
  // onto this object after initialisation, so we can call interactPlugin.enable() in map:ready.
  const interactPlugin = interact({
    interactionModes: ['selectFeature'],
    layers: [{ layerId: 'parcels-fill', labelProperty: 'label' }],
    multiSelect: false
  })

  // Strip stale center/zoom URL params so InteractiveMap doesn't restore them on load.
  // fitBounds in map:stylechange sets the correct viewport from the bbox.
  const currentUrl = new URL(window.location.href)
  currentUrl.searchParams.delete('parcel-map:center')
  currentUrl.searchParams.delete('parcel-map:zoom')
  window.history.replaceState(null, '', currentUrl)

  const map = new InteractiveMap('parcel-map', {
    behaviour: 'inline',
    containerHeight: '500px',
    mapProvider: maplibreProvider(),
    mapStyle: {
      url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      attribution: '© OpenStreetMap contributors © CARTO'
    },
    plugins: [interactPlugin]
  })

  map.on('map:ready', (payload) => {
    maplibre = payload.map

    if (typeof interactPlugin.enable === 'function') {
      interactPlugin.enable()
    }

    // No client-side parcelIds encoding needed — the proxy reads them from the server-side
    // cache keyed by SBI, so plain GET tile requests carry no parcel data in the URL.

    map.on('map:stylechange', () => {
      if (maplibre.getSource('parcels')) { return }

      // Fit to parcel bbox once the style is loaded — MapLibre calculates exact zoom for this container
      if (tileLocation) {
        const { minLng, minLat, maxLng, maxLat } = tileLocation
        maplibre.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 10, animate: false })
      }

      maplibre.addSource('parcels', {
        type: 'vector',
        tiles: [PARCEL_TILE_URL],
        // Declare the source layer explicitly — the tile server has no TileJSON metadata endpoint
        vector_layers: [{ id: PARCEL_TILE_SOURCE_LAYER }],
        // promoteId is required for feature-state (selected highlight) on vector tile sources
        promoteId: { [PARCEL_TILE_SOURCE_LAYER]: 'parcel_id' }
      })

      const sourceLayer = { 'source-layer': PARCEL_TILE_SOURCE_LAYER }
      const colorExpr = buildColorMatchExpression(parcelIds)

      maplibre.addLayer({
        id: 'parcels-fill',
        type: 'fill',
        source: 'parcels',
        ...sourceLayer,
        paint: {
          'fill-color': colorExpr,
          'fill-opacity': ['case', ['==', ['feature-state', 'selected'], true], 0.75, 0.3]
        }
      })

      maplibre.addLayer({
        id: 'parcels-outline',
        type: 'line',
        source: 'parcels',
        ...sourceLayer,
        paint: {
          'line-color': colorExpr,
          'line-width': ['case', ['==', ['feature-state', 'selected'], true], 3, 1.5]
        }
      })

      maplibre.addLayer({
        id: 'parcels-label',
        type: 'symbol',
        source: 'parcels',
        ...sourceLayer,
        layout: { 'text-field': ['coalesce', ['get', 'label'], ['concat', ['get', 'sheet_id'], ' ', ['get', 'parcel_id']]], 'text-size': 11, 'text-anchor': 'center' },
        paint: { 'text-color': '#0b0c0c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
      })
    })

    // Tooltip and click/hover handlers are registered once in map:ready (not inside
    // map:stylechange which fires on every style reload and would duplicate listeners).
    const tooltip = createTooltip(container)

    maplibre.on('click', 'parcels-fill', (e) => {
      const feature = e.features?.[0]
      if (!feature) { return }

      // Enrich vector tile properties with server-side metadata (area, actions)
      const { sheetId, parcelId } = resolveProps(feature.properties ?? {})
      const fullId = sheetId && parcelId ? `${sheetId}-${parcelId}` : parcelId
      const enriched = { ...feature.properties, ...(parcelMeta[fullId] ?? {}) }

      const point = maplibre.project(e.lngLat)
      showTooltip(tooltip, enriched, point.x, point.y)
    })

    // Hide tooltip when clicking empty map area — guard against layer not yet added
    maplibre.on('click', (e) => {
      if (!maplibre.getLayer('parcels-fill')) { return }
      const features = maplibre.queryRenderedFeatures(e.point, { layers: ['parcels-fill'] })
      if (!features.length) { hideTooltip(tooltip) }
    })

    maplibre.on('mouseenter', 'parcels-fill', () => { maplibre.getCanvas().style.cursor = 'pointer' })
    maplibre.on('mouseleave', 'parcels-fill', () => { maplibre.getCanvas().style.cursor = '' })
  })

  map.on('interact:selectionchange', ({ selectedFeatures }) => {
    if (!selectedInputsContainer) { return }

    selectedInputsContainer.innerHTML = selectedFeatures
      .map((f) => {
        const { sheetId, parcelId } = resolveProps(f.properties ?? {})
        const fullId = sheetId && parcelId ? `${sheetId}-${parcelId}` : parcelId
        return `<input type="hidden" name="landParcels" value="${escapeHtml(fullId)}">`
      })
      .join('')

    updateSelectionSummary(selectedFeatures)
  })
}

/**
 * Create a tooltip element positioned absolutely over the map container.
 * Rendered as a sibling of the map div so it sits outside aria-hidden subtrees.
 * @param {HTMLElement} mapContainer
 * @returns {HTMLElement}
 */
function createTooltip(mapContainer) {
  const el = document.createElement('div')
  el.setAttribute('role', 'tooltip')
  el.setAttribute('aria-live', 'polite')
  el.style.cssText = [
    'position:absolute',
    'z-index:9999',
    'background:#fff',
    'border:2px solid #b1b4b6',
    'border-radius:4px',
    'padding:12px 14px',
    'font-size:14px',
    'font-family:GDS Transport,arial,sans-serif',
    'line-height:1.4',
    'max-width:220px',
    'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
    'pointer-events:none',
    'display:none'
  ].join(';')

  // Wrap map container in a relative-positioned wrapper if not already
  const parent = mapContainer.parentElement
  if (parent && !parent.style.position) {
    parent.style.position = 'relative'
  }
  mapContainer.parentElement.appendChild(el)
  return el
}

/**
 * @param {HTMLElement} tooltip
 * @param {Record<string, unknown>} props
 * @param {number} x  pixel x relative to the map canvas
 * @param {number} y  pixel y relative to the map canvas
 */
function showTooltip(tooltip, props, x, y) {
  const { label, areaHa, actionsCount } = resolveProps(props)
  const landCover = toStr(MOCK_LAND_COVER[label] ?? MOCK_LAND_COVER.default)

  tooltip.innerHTML = `
    <strong style="display:block;margin-bottom:8px;font-size:15px">${escapeHtml(label)}</strong>
    <table style="border-collapse:collapse;width:100%">
      <tr>
        <td style="color:#505a5f;padding:2px 12px 2px 0;white-space:nowrap">Total area</td>
        <td>${areaHa == null ? 'Unknown' : escapeHtml(areaHa.toFixed(4) + ' ha')}</td>
      </tr>
      <tr>
        <td style="color:#505a5f;padding:2px 12px 2px 0;white-space:nowrap">SFI actions</td>
        <td>${actionsCount === 0 ? 'None' : escapeHtml(`${actionsCount} action${actionsCount !== 1 ? 's' : ''}`)}</td>
      </tr>
      <tr>
        <td style="color:#505a5f;padding:2px 12px 2px 0;white-space:nowrap">Land cover</td>
        <td>${escapeHtml(landCover)}</td>
      </tr>
    </table>`

  // Offset slightly above the click point; clamp so it doesn't overflow right edge
  const mapEl = tooltip.parentElement?.querySelector('#parcel-map')
  const mapWidth = mapEl ? mapEl.offsetWidth : 600
  const tooltipWidth = 240
  const left = Math.min(x + 12, mapWidth - tooltipWidth - 8)

  tooltip.style.left = `${left}px`
  tooltip.style.top = `${y - 10}px`
  tooltip.style.display = 'block'
}

/** @param {HTMLElement} tooltip */
function hideTooltip(tooltip) {
  tooltip.style.display = 'none'
}

/**
 * Resolve feature properties — vector tiles use snake_case (sheet_id, parcel_id),
 * GeoJSON fallback uses camelCase (sheetId, parcelId). Returns a consistent shape.
 * @param {Record<string, unknown>} props
 * @returns {{ sheetId: string, parcelId: string, label: string, areaHa: number | null, actionsCount: number }}
 */
function resolveProps(props) {
  const sheetId = toStr(props.sheetId ?? props.sheet_id ?? '')
  const parcelId = toStr(props.parcelId ?? props.parcel_id ?? '')
  const label = props.label != null ? toStr(props.label) : `${sheetId} ${parcelId}`.trim()
  const areaHa = props.areaHa == null ? null : Number(props.areaHa)
  const actionsCount = props.actionsCount == null ? 0 : Number(props.actionsCount)
  return { sheetId, parcelId, label, areaHa, actionsCount }
}

/**
 * Safely converts any value to a string, avoiding [object Object].
 * @param {unknown} value
 * @returns {string}
 */
function toStr(value) {
  if (value == null) { return '' }
  if (typeof value === 'string') { return value }
  if (typeof value === 'number' || typeof value === 'boolean') { return String(value) }
  return JSON.stringify(value)
}

/** @param {string} value */
function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** @param {Array<{properties?: Record<string, unknown>}>} features */
function updateSelectionSummary(features) {
  const summaryEl = document.getElementById('parcel-selection-summary')
  if (!summaryEl) { return }

  if (features.length === 0) {
    summaryEl.textContent = 'No parcels selected.'
    return
  }

  const lines = features.map((f) => {
    const { label, areaHa } = resolveProps(f.properties ?? {})
    const area = areaHa == null ? '' : ` — ${areaHa.toFixed(4)} ha`
    return `${label}${area}`
  })

  const totalHa = features.reduce((sum, f) => {
    const { areaHa } = resolveProps(f.properties ?? {})
    return sum + (areaHa ?? 0)
  }, 0)

  const totalStr = totalHa > 0 ? ` (${totalHa.toFixed(4)} ha total)` : ''
  summaryEl.textContent = `Selected: ${lines.join(', ')}${totalStr}`
}

init()
