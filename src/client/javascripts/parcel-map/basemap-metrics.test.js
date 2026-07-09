// @ts-nocheck
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { trackBasemapMetrics, EVENT_METRICS_UPDATE } from './basemap-metrics.js'

function makeMl() {
  const listeners = {}
  return {
    on: vi.fn((event, cb) => {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(cb)
    }),
    off: vi.fn((event, cb) => {
      listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== cb)
    }),
    _emit(event, payload) {
      ;(listeners[event] ?? []).forEach((fn) => fn(payload))
    }
  }
}

function makeTarget() {
  const events = []
  const target = new EventTarget()
  target.addEventListener(EVENT_METRICS_UPDATE, (e) => events.push(e.detail))
  return { target, events }
}

describe('trackBasemapMetrics', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  it('emits an initial metrics snapshot synchronously', () => {
    const ml = makeMl()
    const { target, events } = makeTarget()

    trackBasemapMetrics(ml, 'ordnance-survey', target)

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      provider: 'ordnance-survey',
      tileRequests: 0,
      tileErrors: 0,
      loadMs: null,
      firstTileMs: null,
      bytesTransferred: 0
    })
  })

  it('counts a tile request on sourcedata events that carry a tile', () => {
    const ml = makeMl()
    const { target, events } = makeTarget()
    trackBasemapMetrics(ml, 'ordnance-survey', target)

    ml._emit('sourcedata', { tile: {} })

    expect(events.at(-1).tileRequests).toBe(1)
  })

  it('records firstTileMs on the first tile only', () => {
    const ml = makeMl()
    const { target, events } = makeTarget()
    trackBasemapMetrics(ml, 'ordnance-survey', target)

    performance.now.mockReturnValue(120)
    ml._emit('sourcedata', { tile: {} })
    expect(events.at(-1).firstTileMs).toBe(120)

    performance.now.mockReturnValue(500)
    ml._emit('sourcedata', { tile: {} })
    expect(events.at(-1).firstTileMs).toBe(120)
  })

  it('ignores sourcedata events with no tile', () => {
    const ml = makeMl()
    const { target, events } = makeTarget()
    trackBasemapMetrics(ml, 'ordnance-survey', target)

    ml._emit('sourcedata', {})

    expect(events).toHaveLength(1) // only the initial snapshot
  })

  it('counts errors', () => {
    const ml = makeMl()
    const { target, events } = makeTarget()
    trackBasemapMetrics(ml, 'ordnance-survey', target)

    ml._emit('error', { error: new Error('tile fetch failed') })

    expect(events.at(-1).tileErrors).toBe(1)
  })

  it('records loadMs once, on the first idle event', () => {
    const ml = makeMl()
    const { target, events } = makeTarget()
    trackBasemapMetrics(ml, 'openstreetmap', target)

    performance.now.mockReturnValue(342)
    ml._emit('idle')

    expect(events.at(-1).loadMs).toBe(342)

    // A second idle (e.g. after panning) should not overwrite the first timing
    performance.now.mockReturnValue(9000)
    ml._emit('idle')

    expect(events.at(-1).loadMs).toBe(342)
  })

  it('returns an unsubscribe function that detaches all listeners', () => {
    const ml = makeMl()
    const { target } = makeTarget()
    const disconnect = vi.fn()
    vi.spyOn(globalThis, 'PerformanceObserver').mockImplementation(function () {
      this.observe = vi.fn()
      this.disconnect = disconnect
    })

    const unsubscribe = trackBasemapMetrics(ml, 'ordnance-survey', target)
    unsubscribe()

    expect(ml.off).toHaveBeenCalledWith('sourcedata', expect.any(Function))
    expect(ml.off).toHaveBeenCalledWith('error', expect.any(Function))
    expect(ml.off).toHaveBeenCalledWith('idle', expect.any(Function))
    expect(disconnect).toHaveBeenCalled()
  })

  describe('bytesTransferred (PerformanceObserver)', () => {
    it('sums transferSize for resource entries matching basemap URL patterns', () => {
      const ml = makeMl()
      const { target, events } = makeTarget()
      let observerCallback
      vi.spyOn(globalThis, 'PerformanceObserver').mockImplementation(function (cb) {
        observerCallback = cb
        this.observe = vi.fn()
        this.disconnect = vi.fn()
      })

      trackBasemapMetrics(ml, 'ordnance-survey', target)
      observerCallback({
        getEntries: () => [
          { name: 'http://localhost/api/map/os-tiles/1/2/3', transferSize: 1500, startTime: 10 },
          { name: 'http://localhost/api/map/os-basemap', transferSize: 800, startTime: 20 },
          { name: 'http://localhost/unrelated-asset.js', transferSize: 99999, startTime: 30 }
        ]
      })

      expect(events.at(-1).bytesTransferred).toBe(2300)
    })

    it('counts CartoCDN OSM requests too', () => {
      const ml = makeMl()
      const { target, events } = makeTarget()
      let observerCallback
      vi.spyOn(globalThis, 'PerformanceObserver').mockImplementation(function (cb) {
        observerCallback = cb
        this.observe = vi.fn()
        this.disconnect = vi.fn()
      })

      trackBasemapMetrics(ml, 'openstreetmap', target)
      observerCallback({
        getEntries: () => [
          { name: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json', transferSize: 4200, startTime: 10 }
        ]
      })

      expect(events.at(-1).bytesTransferred).toBe(4200)
    })

    it('does not emit when no matching entries are observed', () => {
      const ml = makeMl()
      const { target, events } = makeTarget()
      let observerCallback
      vi.spyOn(globalThis, 'PerformanceObserver').mockImplementation(function (cb) {
        observerCallback = cb
        this.observe = vi.fn()
        this.disconnect = vi.fn()
      })

      trackBasemapMetrics(ml, 'ordnance-survey', target)
      const countBefore = events.length
      observerCallback({
        getEntries: () => [{ name: 'http://localhost/unrelated.js', transferSize: 100, startTime: 10 }]
      })

      expect(events).toHaveLength(countBefore)
    })

    it('ignores entries that started before this tracker began (previous provider load)', () => {
      const ml = makeMl()
      const { target, events } = makeTarget()
      let observerCallback
      vi.spyOn(globalThis, 'PerformanceObserver').mockImplementation(function (cb) {
        observerCallback = cb
        this.observe = vi.fn()
        this.disconnect = vi.fn()
      })

      performance.now.mockReturnValue(1000)
      trackBasemapMetrics(ml, 'openstreetmap', target)

      observerCallback({
        getEntries: () => [
          { name: 'http://localhost/api/map/os-tiles/1/2/3', transferSize: 1500, startTime: 200 },
          { name: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json', transferSize: 4200, startTime: 1100 }
        ]
      })

      expect(events.at(-1).bytesTransferred).toBe(4200)
    })

    it('does not double-count an entry replayed across multiple observer callbacks', () => {
      const ml = makeMl()
      const { target, events } = makeTarget()
      let observerCallback
      vi.spyOn(globalThis, 'PerformanceObserver').mockImplementation(function (cb) {
        observerCallback = cb
        this.observe = vi.fn()
        this.disconnect = vi.fn()
      })

      trackBasemapMetrics(ml, 'ordnance-survey', target)
      const entry = { name: 'http://localhost/api/map/os-tiles/1/2/3', transferSize: 1500, startTime: 10 }

      observerCallback({ getEntries: () => [entry] })
      observerCallback({ getEntries: () => [entry] })

      expect(events.at(-1).bytesTransferred).toBe(1500)
    })
  })
})
