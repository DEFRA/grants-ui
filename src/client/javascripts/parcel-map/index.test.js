// @ts-nocheck
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@defra/interactive-map', () => ({ default: vi.fn() }))
vi.mock('@defra/interactive-map/providers/maplibre', () => ({
  default: vi.fn(() => ({
    load: async () => ({
      MapProvider: class {
        getFeaturesAtPoint() {
          return []
        }
      }
    })
  }))
}))
vi.mock('@defra/interactive-map/plugins/interact', () => ({
  default: vi.fn(() => ({ enable: vi.fn(), disable: vi.fn(), clear: vi.fn() }))
}))
import InteractiveMap from '@defra/interactive-map'
import createInteractPlugin from '@defra/interactive-map/plugins/interact'
import { LAYER_ID_FILL, LAYER_ID_OUTLINE, LAYER_ID_LABEL, EVENT_READY, EVENT_ERROR, EVENT_SELECTION } from './config.js'

const PARCELS_RESPONSE = {
  features: [
    { id: 'SD7148-9160', properties: { sheet_id: 'SD7148', parcel_id: '9160', areaHa: 2.5 } },
    { id: 'SD7148-9161', properties: { sheet_id: 'SD7148', parcel_id: '9161', areaHa: null } }
  ],
  bbox: { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 }
}

function makeMlMap(overrides = {}) {
  const listeners = {}
  const ml = {
    fitBounds: vi.fn(),
    getSource: vi.fn().mockReturnValue(null),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getLayer: vi.fn().mockReturnValue(true),
    queryRenderedFeatures: vi.fn().mockReturnValue([]),
    querySourceFeatures: vi.fn().mockReturnValue([]),
    setPaintProperty: vi.fn(),
    project: vi.fn().mockReturnValue({ x: 100, y: 200 }),
    getCanvas: vi.fn().mockReturnValue({ style: {} }),
    on: vi.fn((event, layerOrCb, cb) => {
      const key = cb ? `${event}:${layerOrCb}` : event
      const handler = cb ?? layerOrCb
      listeners[key] = listeners[key] ?? []
      listeners[key].push(handler)
    }),
    off: vi.fn((event, layerOrCb, cb) => {
      const key = cb ? `${event}:${layerOrCb}` : event
      const handler = cb ?? layerOrCb
      listeners[key] = (listeners[key] ?? []).filter((fn) => fn !== handler)
    }),
    _emit(event, eventObj) {
      ;(listeners[event] ?? []).forEach((fn) => fn(eventObj))
    },
    _emitLayer(event, layer, eventObj) {
      ;(listeners[`${event}:${layer}`] ?? []).forEach((fn) => fn(eventObj))
    },
    ...overrides
  }
  return ml
}

function makeFeature(sheetId, parcelId, numericId) {
  return {
    id: numericId ?? 1,
    properties: { sheet_id: sheetId, parcel_id: parcelId, id: `${sheetId}-${parcelId}` },
    geometry: { type: 'Point', coordinates: [0, 0] }
  }
}

function setupInteractiveMapMock(ml) {
  InteractiveMap.mockImplementation(function () {
    this._handlers = {}
    this.on = vi.fn((event, cb) => {
      this._handlers[event] = this._handlers[event] ?? []
      this._handlers[event].push(cb)
    })
    this.destroy = vi.fn()
    this._emit = (event, payload) => {
      ;(this._handlers[event] ?? []).forEach((fn) => fn(payload))
    }
    Promise.resolve().then(() => {
      this._emit('map:ready', { map: ml })
      this._emit('map:stylechange')
    })
  })
}

function fetchOk(body) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
}

function waitForEvent(el, eventName) {
  return new Promise((resolve) => el.addEventListener(eventName, resolve, { once: true }))
}

// Latest InteractiveMap mock instance — used to emit plugin events (e.g.
// interact:selectionchange) the way the real event bus would.
function lastMapInstance() {
  return InteractiveMap.mock.instances.at(-1)
}

function emitSelectionChange(selectedFeatures) {
  lastMapInstance()._emit('interact:selectionchange', {
    selectedFeatures,
    selectedMarkers: [],
    contiguous: false
  })
}

async function mountElement(attrs = {}) {
  const el = document.createElement('parcel-map')
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v)
  }
  document.body.appendChild(el)
  return el
}

describe('parcel-map web component', () => {
  let ml

  beforeEach(async () => {
    await import('./index.js')
    ml = makeMlMap()
    setupInteractiveMapMock(ml)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  describe('lifecycle', () => {
    it('dispatches parcel-map:ready when map and data load successfully', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)
      expect(el.querySelector('[role="alert"]')).toBeNull()
    })

    it('dispatches parcel-map:error and shows error overlay when fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })
      const el = await mountElement()
      const e = await waitForEvent(el, EVENT_ERROR)
      expect(e.detail.reason).toBe('unavailable')
      expect(el.querySelector('[role="alert"]')).not.toBeNull()
    })

    it('dispatches parcel-map:error when InteractiveMap emits map:error', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      InteractiveMap.mockImplementation(function () {
        this._handlers = {}
        this.on = vi.fn((event, cb) => {
          this._handlers[event] = this._handlers[event] ?? []
          this._handlers[event].push(cb)
        })
        this.destroy = vi.fn()
        Promise.resolve().then(() => {
          ;(this._handlers['map:error'] ?? []).forEach((fn) => fn())
        })
      })
      const el = await mountElement()
      const e = await waitForEvent(el, EVENT_ERROR)
      expect(e.detail.reason).toBe('unavailable')
    })

    it('removes skeleton and map elements after error', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })
      const el = await mountElement()
      await waitForEvent(el, EVENT_ERROR)
      expect(el.querySelector('[role="status"]')).toBeNull()
      // Map wrapper (the div wrapping the canvas) should be gone too
      expect(el.querySelectorAll('div').length).toBeLessThanOrEqual(1) // only the error overlay
    })

    it('removes skeleton once ready', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)
      expect(el.querySelector('[role="status"]')).toBeNull()
    })

    it('dispatches parcel-map:error with reason no-parcels when API returns empty features', async () => {
      global.fetch = fetchOk({ features: [], bbox: null })
      const el = await mountElement()
      const e = await waitForEvent(el, EVENT_ERROR)
      expect(e.detail.reason).toBe('no-parcels')
    })
  })

  describe('viewport options', () => {
    it('disables InteractiveMap URL viewport sync', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const [, options] = InteractiveMap.mock.calls[0]
      expect(options.urlPosition).toBe('none')
    })

    it('constrains zoom-out to the OS basemap coverage (min zoom 7) by default', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const [, options] = InteractiveMap.mock.calls[0]
      expect(options.minZoom).toBe(7)
    })

    it('sets an accessible mapLabel for screen readers', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const [, options] = InteractiveMap.mock.calls[0]
      expect(options.mapLabel).toEqual(expect.stringContaining('land parcels'))
    })
  })

  describe('basemap provider', () => {
    it('defaults to the OS Maps style when no attribute is set', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const [, options] = InteractiveMap.mock.calls.at(-1)
      expect(options.mapStyle.url).toBe('/api/map/os-basemap')
      expect(options.minZoom).toBe(7)
    })

    it('defaults to OS Maps even when the attribute is explicitly "ordnance-survey"', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement({ 'basemap-provider': 'ordnance-survey' })
      await waitForEvent(el, EVENT_READY)

      const [, options] = InteractiveMap.mock.calls.at(-1)
      expect(options.mapStyle.url).toBe('/api/map/os-basemap')
    })

    // TEMPORARY: OS Maps vs OpenStreetMap comparison (TGC-1418 follow-up) —
    // delete this describe block once the comparison is complete.
    describe('OpenStreetMap comparison (temporary)', () => {
      it('switches to the OpenStreetMap style when basemap-provider="openstreetmap"', async () => {
        global.fetch = fetchOk(PARCELS_RESPONSE)
        const el = await mountElement({ 'basemap-provider': 'openstreetmap' })
        await waitForEvent(el, EVENT_READY)

        const [, options] = InteractiveMap.mock.calls.at(-1)
        expect(options.mapStyle.url).toBe('https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json')
        expect(options.mapStyle.attribution).toContain('OpenStreetMap')
      })

      it('does not constrain minZoom for the OpenStreetMap style', async () => {
        global.fetch = fetchOk(PARCELS_RESPONSE)
        const el = await mountElement({ 'basemap-provider': 'openstreetmap' })
        await waitForEvent(el, EVENT_READY)

        const [, options] = InteractiveMap.mock.calls.at(-1)
        expect(options.minZoom).toBeUndefined()
      })

      it('re-initialises the map when basemap-provider changes at runtime', async () => {
        global.fetch = fetchOk(PARCELS_RESPONSE)
        const el = await mountElement()
        await waitForEvent(el, EVENT_READY)
        const callsBeforeToggle = InteractiveMap.mock.calls.length

        const readyAgain = waitForEvent(el, EVENT_READY)
        el.setAttribute('basemap-provider', 'openstreetmap')
        await readyAgain

        expect(InteractiveMap.mock.calls.length).toBe(callsBeforeToggle + 1)
        const [, options] = InteractiveMap.mock.calls.at(-1)
        expect(options.mapStyle.url).toBe('https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json')
      })

      it('ignores attribute changes before the element is connected', async () => {
        const el = document.createElement('parcel-map')
        const callsBefore = InteractiveMap.mock.calls.length
        el.setAttribute('basemap-provider', 'openstreetmap')
        // No mountElement/appendChild here — attributeChangedCallback should no-op
        expect(InteractiveMap.mock.calls.length).toBe(callsBefore)
      })
    })
  })

  describe('data fetching', () => {
    it('adds vector tile source when parcels are returned', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)
      expect(ml.addSource).toHaveBeenCalledWith('parcels', expect.objectContaining({ type: 'vector' }))
    })

    it('dispatches parcel-map:error when fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network'))
      const el = await mountElement()
      const e = await waitForEvent(el, EVENT_ERROR)
      expect(e.detail.reason).toBe('unavailable')
    })

    it('adds geojson source when mock mode is indicated in response', async () => {
      global.fetch = fetchOk({ ...PARCELS_RESPONSE, mock: true })
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)
      expect(ml.addSource).toHaveBeenCalledWith('parcels', expect.objectContaining({ type: 'geojson' }))
    })
  })

  describe('_addParcelsToMap', () => {
    it('calls fitBounds when bbox is present', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)
      expect(ml.fitBounds).toHaveBeenCalledWith(
        [
          [-2.5, 51.4],
          [-2.3, 51.6]
        ],
        expect.objectContaining({ padding: 40, animate: false })
      )
    })

    it('does not call fitBounds when bbox is null', async () => {
      global.fetch = fetchOk({ ...PARCELS_RESPONSE, bbox: null })
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)
      expect(ml.fitBounds).not.toHaveBeenCalled()
    })

    it('adds fill, outline and label layers', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)
      const layerIds = ml.addLayer.mock.calls.map((c) => c[0].id)
      expect(layerIds).toContain(LAYER_ID_FILL)
      expect(layerIds).toContain(LAYER_ID_OUTLINE)
      expect(layerIds).toContain(LAYER_ID_LABEL)
    })

    it('resolves PARCEL_TILES_URL against location.origin when no geojsonUrl', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)
      const [, sourceSpec] = ml.addSource.mock.calls[0]
      expect(sourceSpec.tiles[0]).toBe(`${globalThis.location.origin}/api/map/parcel-tiles/{z}/{x}/{y}`)
    })
  })

  describe('interact plugin configuration', () => {
    it('creates the plugin for feature selection on the fill layer with compound id property', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      expect(createInteractPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          interactionModes: ['selectFeature'],
          multiSelect: false,
          deselectOnClickOutside: true,
          layers: [expect.objectContaining({ layerId: LAYER_ID_FILL, idProperty: 'id', labelProperty: 'id' })]
        })
      )
    })

    it('falls back to a rendered-pixel radius query when the strict provider query misses', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const [, options] = InteractiveMap.mock.calls.at(-1)
      const { MapProvider } = await options.mapProvider.load()
      const provider = new MapProvider()
      const fallbackFeatures = [{ layer: { id: LAYER_ID_FILL }, properties: { id: 'SD7148-9160' } }]
      provider.map = {
        getLayer: vi.fn().mockReturnValue(true),
        queryRenderedFeatures: vi.fn().mockReturnValue(fallbackFeatures)
      }

      const hits = provider.getFeaturesAtPoint({ x: 50, y: 60 }, { radius: 10 })

      expect(provider.map.queryRenderedFeatures).toHaveBeenCalledWith(
        [
          [40, 50],
          [60, 70]
        ],
        { layers: [LAYER_ID_FILL] }
      )
      expect(hits).toBe(fallbackFeatures)
    })

    it('picks the closest feature when the fallback finds several overlapping the tolerance box', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const [, options] = InteractiveMap.mock.calls.at(-1)
      const { MapProvider } = await options.mapProvider.load()
      const provider = new MapProvider()

      // Both are single-point "polygons" (only the corner matters for the
      // bounding-box centre this test exercises) — `near` projects to a
      // screen point right at the click, `far` projects well outside it.
      const near = {
        layer: { id: LAYER_ID_FILL },
        properties: { id: 'SD7148-9160' },
        geometry: { type: 'Polygon', coordinates: [[[0, 0]]] }
      }
      const far = {
        layer: { id: LAYER_ID_FILL },
        properties: { id: 'SD7148-9161' },
        geometry: { type: 'Polygon', coordinates: [[[1, 1]]] }
      }
      provider.map = {
        getLayer: vi.fn().mockReturnValue(true),
        queryRenderedFeatures: vi.fn().mockReturnValue([far, near]),
        project: vi.fn(([lng]) => (lng === 0 ? { x: 50, y: 60 } : { x: 500, y: 500 }))
      }

      const hits = provider.getFeaturesAtPoint({ x: 50, y: 60 }, { radius: 10 })

      expect(hits).toEqual([near])
    })

    it('does not run the fallback when the strict query already has hits', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const [, options] = InteractiveMap.mock.calls.at(-1)
      const loaded = await options.mapProvider.load()
      const strictHits = [{ layer: { id: LAYER_ID_FILL } }]
      // Re-wrap a base that returns hits to prove the fallback is skipped
      const provider = new loaded.MapProvider()
      provider.map = { getLayer: vi.fn(), queryRenderedFeatures: vi.fn() }
      Object.getPrototypeOf(Object.getPrototypeOf(provider)).getFeaturesAtPoint = () => strictHits

      const hits = provider.getFeaturesAtPoint({ x: 0, y: 0 })

      expect(hits).toBe(strictHits)
      expect(provider.map.queryRenderedFeatures).not.toHaveBeenCalled()
    })

    it('passes the plugin to the InteractiveMap constructor', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const pluginInstance = createInteractPlugin.mock.results.at(-1).value
      const [, options] = InteractiveMap.mock.calls.at(-1)
      expect(options.plugins).toContain(pluginInstance)
    })

    it('enables the plugin once parcels are on the map', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const pluginInstance = createInteractPlugin.mock.results.at(-1).value
      expect(pluginInstance.enable).toHaveBeenCalled()
    })

    it('does not enable the plugin when the user has no parcels', async () => {
      global.fetch = fetchOk({ features: [], bbox: null })
      const el = await mountElement()
      await waitForEvent(el, EVENT_ERROR)

      const pluginInstance = createInteractPlugin.mock.results.at(-1).value
      expect(pluginInstance.enable).not.toHaveBeenCalled()
    })

    it('creates the plugin with multiSelect when the attribute is set', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement({ 'multi-select': 'true' })
      await waitForEvent(el, EVENT_READY)

      expect(createInteractPlugin).toHaveBeenCalledWith(expect.objectContaining({ multiSelect: true }))
    })
  })

  describe('selection bridge', () => {
    it('dispatches parcel-map:selection with the plugin-selected parcel IDs', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const selectionEvent = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([{ featureId: 'SD7148-9160' }])
      const e = await selectionEvent
      expect(e.detail.selectedIds).toEqual(['SD7148-9160'])
    })

    it('dispatches an empty selection when the plugin clears it', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const first = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([{ featureId: 'SD7148-9160' }])
      await first

      const cleared = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([])
      const e = await cleared
      expect(e.detail.selectedIds).toEqual([])
    })

    it('dispatches all selected IDs in multi-select', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement({ 'multi-select': 'true' })
      await waitForEvent(el, EVENT_READY)

      const selectionEvent = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([{ featureId: 'SD7148-9160' }, { featureId: 'SD7148-9161' }])
      const e = await selectionEvent
      expect(e.detail.selectedIds).toEqual(['SD7148-9160', 'SD7148-9161'])
    })

    it('calls setPaintProperty to highlight selected parcels', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      const first = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([{ featureId: 'SD7148-9160' }])
      await first

      expect(ml.setPaintProperty).toHaveBeenCalledWith(LAYER_ID_FILL, 'fill-opacity', expect.arrayContaining(['match']))
    })

    it('hides the tooltip when the selection is cleared', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      // Show the tooltip via a parcel click first
      ml._emitLayer('click', LAYER_ID_FILL, { features: [makeFeature('SD7148', '9160')], lngLat: { lng: 0, lat: 0 } })
      const tooltip = el.querySelector('[role="tooltip"]')
      expect(tooltip.style.display).toBe('block')

      const cleared = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([{ featureId: 'SD7148-9160' }])
      emitSelectionChange([])
      await cleared

      expect(tooltip.style.display).toBe('none')
    })
  })

  describe('tooltip', () => {
    it('renders parcel ID and area in tooltip on click', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      ml._emitLayer('click', LAYER_ID_FILL, {
        features: [makeFeature('SD7148', '9160')],
        lngLat: { lng: 0, lat: 0 }
      })

      const tooltip = el.querySelector('[role="tooltip"]')
      expect(tooltip).not.toBeNull()
      expect(tooltip.innerHTML).toContain('SD7148-9160')
      expect(tooltip.innerHTML).toContain('2.50 ha')
    })

    it('shows "Unknown" area when areaHa is null', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, EVENT_READY)

      ml._emitLayer('click', LAYER_ID_FILL, {
        features: [makeFeature('SD7148', '9161')],
        lngLat: { lng: 0, lat: 0 }
      })

      const tooltip = el.querySelector('[role="tooltip"]')
      expect(tooltip.innerHTML).toContain('Unknown')
    })
  })
})
