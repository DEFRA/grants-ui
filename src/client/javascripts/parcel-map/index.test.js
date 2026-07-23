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
import { makeMlMap } from './test-helpers.js'

const PARCELS_RESPONSE = {
  features: [
    { id: 'SD7148-9160', properties: { sheet_id: 'SD7148', parcel_id: '9160', areaHa: 2.5 } },
    { id: 'SD7148-9161', properties: { sheet_id: 'SD7148', parcel_id: '9161', areaHa: null } }
  ],
  bbox: { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 }
}

function makeFeature(sheetId, parcelId, numericId) {
  return {
    id: numericId ?? 1,
    properties: { sheet_id: sheetId, parcel_id: parcelId, id: `${sheetId}-${parcelId}` },
    geometry: { type: 'Point', coordinates: [0, 0] }
  }
}

function stubInteractiveMap({ mode = 'ready', ml, capture, once = false } = {}) {
  const impl = function () {
    this._handlers = {}
    this.on = vi.fn((event, cb) => {
      this._handlers[event] = this._handlers[event] ?? []
      this._handlers[event].push(cb)
    })
    this.destroy = vi.fn()
    this._emit = (event, payload) => {
      ;(this._handlers[event] ?? []).forEach((fn) => fn(payload))
    }
    capture?.(this)
    if (mode === 'ready') {
      Promise.resolve().then(() => {
        this._emit('map:ready', { map: ml })
        this._emit('map:stylechange')
      })
    } else if (mode === 'error') {
      Promise.resolve().then(() => this._emit('map:error'))
    }
  }
  if (once) {
    InteractiveMap.mockImplementationOnce(impl)
  } else {
    InteractiveMap.mockImplementation(impl)
  }
}

function fetchOk(body) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
}

function waitForEvent(el, eventName) {
  return new Promise((resolve) => el.addEventListener(eventName, resolve, { once: true }))
}

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

async function mountReady(attrs = {}) {
  global.fetch = fetchOk(PARCELS_RESPONSE)
  const el = await mountElement(attrs)
  await waitForEvent(el, EVENT_READY)
  return el
}

describe('parcel-map web component', () => {
  let ml

  beforeEach(async () => {
    await import('./index.js')
    ml = makeMlMap()
    stubInteractiveMap({ ml })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  describe('lifecycle', () => {
    it('dispatches parcel-map:ready when map and data load successfully', async () => {
      const el = await mountReady()
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
      stubInteractiveMap({ mode: 'error' })
      const el = await mountElement()
      const e = await waitForEvent(el, EVENT_ERROR)
      expect(e.detail.reason).toBe('unavailable')
    })

    it('removes skeleton and map elements after error', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })
      const el = await mountElement()
      await waitForEvent(el, EVENT_ERROR)

      expect(el.querySelector('[role="status"]')).toBeNull()
      expect(el.querySelectorAll('div').length).toBeLessThanOrEqual(1)
    })

    it('removes skeleton once ready', async () => {
      const el = await mountReady()
      expect(el.querySelector('[role="status"]')).toBeNull()
    })

    it('dispatches parcel-map:error with reason no-parcels when API returns empty features', async () => {
      global.fetch = fetchOk({ features: [], bbox: null })
      const el = await mountElement()
      const e = await waitForEvent(el, EVENT_ERROR)
      expect(e.detail.reason).toBe('no-parcels')
    })

    it('dispatches parcel-map:ready exactly once after a disconnect-while-loading then reconnect', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      stubInteractiveMap({ mode: 'none', once: true })

      const el = await mountElement()
      el.remove() // disconnect mid-load must not leave a load in flight

      let readyCount = 0
      el.addEventListener(EVENT_READY, () => {
        readyCount++
      })
      document.body.appendChild(el) // reconnect → fresh load, second instance auto-readies

      await waitForEvent(el, EVENT_READY)
      await Promise.resolve()
      await Promise.resolve()
      expect(readyCount).toBe(1)
    })

    it('does not show the error overlay when maplibre emits an error after ready', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const el = await mountReady()

      ml._emit('error', new Error('basemap tile 404'))
      await Promise.resolve()

      expect(el.querySelector('[role="alert"]')).toBeNull()
      errorSpy.mockRestore()
    })

    it('removes every maplibre listener it added on teardown', async () => {
      const el = await mountReady()

      expect(ml.on.mock.calls.length).toBeGreaterThan(0)
      el.remove() // disconnect → teardown
      expect(ml.off).toHaveBeenCalledTimes(ml.on.mock.calls.length)
    })

    it('dispatches an unavailable error when the map load times out', async () => {
      vi.useFakeTimers()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        global.fetch = fetchOk(PARCELS_RESPONSE)
        stubInteractiveMap({ mode: 'none', once: true })

        const el = await mountElement()
        const errorEvent = waitForEvent(el, EVENT_ERROR)
        await vi.advanceTimersByTimeAsync(10000)
        const e = await errorEvent

        expect(e.detail.reason).toBe('unavailable')
      } finally {
        vi.useRealTimers()
        errorSpy.mockRestore()
      }
    })

    it('clears the load timeout when InteractiveMap emits map:error', async () => {
      vi.useFakeTimers()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        global.fetch = fetchOk(PARCELS_RESPONSE)
        stubInteractiveMap({ mode: 'error' })

        const el = await mountElement()
        await waitForEvent(el, EVENT_ERROR)

        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
        errorSpy.mockRestore()
      }
    })
  })

  describe('viewport options', () => {
    it('disables URL sync, constrains zoom-out to OS min zoom 7, and sets an accessible mapLabel', async () => {
      await mountReady()

      const [, options] = InteractiveMap.mock.calls[0]
      expect(options.urlPosition).toBe('none')
      expect(options.minZoom).toBe(7)
      expect(options.mapLabel).toEqual(expect.stringContaining('land parcels'))
    })
  })

  describe('basemap', () => {
    it('uses the OS Maps style and constrains zoom-out to OS min zoom 7', async () => {
      await mountReady()

      const [, options] = InteractiveMap.mock.calls.at(-1)
      expect(options.mapStyle.url).toBe('/api/map/os-basemap')
      expect(options.minZoom).toBe(7)
    })
  })

  describe('data fetching', () => {
    it('adds vector tile source when parcels are returned', async () => {
      await mountReady()
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
      await mountReady()
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
      await mountReady()
      const layerIds = ml.addLayer.mock.calls.map((c) => c[0].id)
      expect(layerIds).toContain(LAYER_ID_FILL)
      expect(layerIds).toContain(LAYER_ID_OUTLINE)
      expect(layerIds).toContain(LAYER_ID_LABEL)
    })

    it('resolves PARCEL_TILES_URL against location.origin when no geojsonUrl', async () => {
      await mountReady()
      const [, sourceSpec] = ml.addSource.mock.calls[0]
      expect(sourceSpec.tiles[0]).toBe(`${globalThis.location.origin}/api/map/parcel-tiles/{z}/{x}/{y}`)
    })
  })

  describe('interact plugin configuration', () => {
    it('creates the plugin for feature selection on the fill layer with compound id property', async () => {
      await mountReady()

      expect(createInteractPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          interactionModes: ['selectFeature'],
          multiSelect: false,
          deselectOnClickOutside: true,
          layers: [expect.objectContaining({ layerId: LAYER_ID_FILL, idProperty: 'id', labelProperty: 'id' })]
        })
      )
    })

    it('passes the plugin to the InteractiveMap constructor', async () => {
      await mountReady()

      const pluginInstance = createInteractPlugin.mock.results.at(-1).value
      const [, options] = InteractiveMap.mock.calls.at(-1)
      expect(options.plugins).toContain(pluginInstance)
    })

    it('enables the plugin once parcels are on the map', async () => {
      await mountReady()

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
      await mountReady({ 'multi-select': 'true' })

      expect(createInteractPlugin).toHaveBeenCalledWith(expect.objectContaining({ multiSelect: true }))
    })
  })

  describe('selection bridge', () => {
    it('dispatches parcel-map:selection with the plugin-selected parcel IDs', async () => {
      const el = await mountReady()

      const selectionEvent = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([{ featureId: 'SD7148-9160' }])
      const e = await selectionEvent
      expect(e.detail.selectedIds).toEqual(['SD7148-9160'])
    })

    it('dispatches an empty selection when the plugin clears it', async () => {
      const el = await mountReady()

      const first = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([{ featureId: 'SD7148-9160' }])
      await first

      const cleared = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([])
      const e = await cleared
      expect(e.detail.selectedIds).toEqual([])
    })

    it('dispatches all selected IDs in multi-select', async () => {
      const el = await mountReady({ 'multi-select': 'true' })

      const selectionEvent = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([{ featureId: 'SD7148-9160' }, { featureId: 'SD7148-9161' }])
      const e = await selectionEvent
      expect(e.detail.selectedIds).toEqual(['SD7148-9160', 'SD7148-9161'])
    })

    it('calls setPaintProperty to highlight selected parcels', async () => {
      const el = await mountReady()

      const first = waitForEvent(el, EVENT_SELECTION)
      emitSelectionChange([{ featureId: 'SD7148-9160' }])
      await first

      expect(ml.setPaintProperty).toHaveBeenCalledWith(LAYER_ID_FILL, 'fill-opacity', expect.arrayContaining(['match']))
    })

    it('hides the tooltip when the selection is cleared', async () => {
      const el = await mountReady()

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
      const el = await mountReady()

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
      const el = await mountReady()

      ml._emitLayer('click', LAYER_ID_FILL, {
        features: [makeFeature('SD7148', '9161')],
        lngLat: { lng: 0, lat: 0 }
      })

      const tooltip = el.querySelector('[role="tooltip"]')
      expect(tooltip.innerHTML).toContain('Unknown')
    })
  })
})
