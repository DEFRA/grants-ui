// @ts-nocheck
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@defra/interactive-map', () => ({ default: vi.fn() }))
vi.mock('@defra/interactive-map/providers/maplibre', () => ({ default: vi.fn(() => ({})) }))
import InteractiveMap from '@defra/interactive-map'
import { LAYER_ID_FILL, LAYER_ID_OUTLINE, LAYER_ID_LABEL } from './config.js'

const PARCELS_RESPONSE = {
  features: [
    { id: 'SD7148-9160', properties: { sheet_id: 'SD7148', parcel_id: '9160', areaHa: 2.5 } },
    { id: 'SD7148-9161', properties: { sheet_id: 'SD7148', parcel_id: '9161', areaHa: null } }
  ],
  bbox: { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 },
  tileUrl: '/land-grants/parcel-tiles/{z}/{x}/{y}'
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
    properties: { sheet_id: sheetId, parcel_id: parcelId },
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
      await waitForEvent(el, 'parcel-map:ready')
      expect(el._state).toBe('ready')
    })

    it('dispatches parcel-map:error and tears down when fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:error')
      expect(el._state).toBe('idle')
      expect(el._mapInstance).toBeNull()
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
      await waitForEvent(el, 'parcel-map:error')
      expect(el._state).toBe('idle')
    })

    it('teardown removes skeleton and map elements', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')
      el._teardown()
      expect(el._skeleton).toBeNull()
      expect(el._mapEl).toBeNull()
      expect(el._mapInstance).toBeNull()
    })

    it('re-initialises when multi-select attribute changes after ready', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')

      const readyAgain = waitForEvent(el, 'parcel-map:ready')
      el.setAttribute('multi-select', 'true')
      await readyAgain
      expect(el._state).toBe('ready')
    })
  })

  describe('_fetchData', () => {
    it('extracts parcelIds and metaIndex from features', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')

      expect(ml.addSource).toHaveBeenCalledWith('parcels', expect.objectContaining({ type: 'vector' }))
    })

    it('returns null when fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network'))
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:error')
      expect(el._state).toBe('idle')
    })

    it('handles missing tileUrl gracefully — skips addSource', async () => {
      global.fetch = fetchOk({ ...PARCELS_RESPONSE, tileUrl: null })
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')
      expect(ml.addSource).not.toHaveBeenCalled()
    })
  })

  describe('_addParcelsToMap', () => {
    it('calls fitBounds when bbox is present', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')
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
      await waitForEvent(el, 'parcel-map:ready')
      expect(ml.fitBounds).not.toHaveBeenCalled()
    })

    it('adds fill, outline and label layers', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')
      const layerIds = ml.addLayer.mock.calls.map((c) => c[0].id)
      expect(layerIds).toContain(LAYER_ID_FILL)
      expect(layerIds).toContain(LAYER_ID_OUTLINE)
      expect(layerIds).toContain(LAYER_ID_LABEL)
    })

    it('resolves relative tileUrl against location.origin', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')
      const [, sourceSpec] = ml.addSource.mock.calls[0]
      expect(sourceSpec.tiles[0]).toBe(`${globalThis.location.origin}/land-grants/parcel-tiles/{z}/{x}/{y}`)
    })
  })

  describe('selection — single-select (default)', () => {
    it('dispatches parcel-map:selection with clicked parcel ID', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')

      const selectionEvent = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, { features: [makeFeature('SD7148', '9160')], lngLat: { lng: 0, lat: 0 } })
      const e = await selectionEvent
      expect(e.detail.selectedIds).toEqual(['SD7148-9160'])
    })

    it('deselects when the same parcel is clicked twice', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')

      const clickPayload = { features: [makeFeature('SD7148', '9160')], lngLat: { lng: 0, lat: 0 } }

      const first = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, clickPayload)
      await first

      const second = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, clickPayload)
      const e = await second
      expect(e.detail.selectedIds).toEqual([])
    })

    it('replaces selection when a different parcel is clicked', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')

      const first = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, { features: [makeFeature('SD7148', '9160')], lngLat: { lng: 0, lat: 0 } })
      await first

      const second = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, { features: [makeFeature('SD7148', '9161')], lngLat: { lng: 0, lat: 0 } })
      const e = await second
      expect(e.detail.selectedIds).toEqual(['SD7148-9161'])
    })

    it('clears selection when clicking empty map area', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')

      const first = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, { features: [makeFeature('SD7148', '9160')], lngLat: { lng: 0, lat: 0 } })
      await first

      ml.queryRenderedFeatures.mockReturnValue([])
      const cleared = waitForEvent(el, 'parcel-map:selection')
      ml._emit('click', { point: { x: 0, y: 0 } })
      const e = await cleared
      expect(e.detail.selectedIds).toEqual([])
    })

    it('calls setPaintProperty to highlight selected parcel', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')

      const first = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, { features: [makeFeature('SD7148', '9160')], lngLat: { lng: 0, lat: 0 } })
      await first

      expect(ml.setPaintProperty).toHaveBeenCalledWith(
        LAYER_ID_FILL,
        'fill-opacity',
        expect.arrayContaining(['match'])
      )
    })

    it('ignores clicks with no feature', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')

      let fired = false
      el.addEventListener('parcel-map:selection', () => {
        fired = true
      })
      ml._emitLayer('click', LAYER_ID_FILL, { features: [], lngLat: { lng: 0, lat: 0 } })
      await Promise.resolve()
      expect(fired).toBe(false)
    })
  })

  describe('selection — multi-select', () => {
    it('accumulates multiple selections', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement({ 'multi-select': 'true' })
      await waitForEvent(el, 'parcel-map:ready')

      const first = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, { features: [makeFeature('SD7148', '9160')], lngLat: { lng: 0, lat: 0 } })
      await first

      const second = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, { features: [makeFeature('SD7148', '9161')], lngLat: { lng: 0, lat: 0 } })
      const e = await second
      expect(e.detail.selectedIds).toEqual(['SD7148-9160', 'SD7148-9161'])
    })

    it('removes a parcel when clicked again in multi-select', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement({ 'multi-select': 'true' })
      await waitForEvent(el, 'parcel-map:ready')

      const clickPayload = { features: [makeFeature('SD7148', '9160')], lngLat: { lng: 0, lat: 0 } }

      const first = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, clickPayload)
      await first

      const second = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, clickPayload)
      const e = await second
      expect(e.detail.selectedIds).toEqual([])
    })
  })

  describe('tooltip', () => {
    it('renders parcel ID and area in tooltip on click', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')

      const sel = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, {
        features: [makeFeature('SD7148', '9160')],
        lngLat: { lng: 0, lat: 0 }
      })
      await sel

      const tooltip = el.querySelector('[role="tooltip"]')
      expect(tooltip).not.toBeNull()
      expect(tooltip.innerHTML).toContain('SD7148-9160')
      expect(tooltip.innerHTML).toContain('2.50 ha')
    })

    it('shows "Unknown" area when areaHa is null', async () => {
      global.fetch = fetchOk(PARCELS_RESPONSE)
      const el = await mountElement()
      await waitForEvent(el, 'parcel-map:ready')

      const sel = waitForEvent(el, 'parcel-map:selection')
      ml._emitLayer('click', LAYER_ID_FILL, {
        features: [makeFeature('SD7148', '9161')],
        lngLat: { lng: 0, lat: 0 }
      })
      await sel

      const tooltip = el.querySelector('[role="tooltip"]')
      expect(tooltip.innerHTML).toContain('Unknown')
    })
  })
})
