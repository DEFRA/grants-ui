// @ts-nocheck
import { vi } from 'vitest'

export function makeMlMap(overrides = {}) {
  const listeners = {}

  function on(event, layerOrCb, cb) {
    const key = cb ? `${event}:${layerOrCb}` : event
    const handler = cb ?? layerOrCb
    listeners[key] = listeners[key] ?? []
    listeners[key].push(handler)
  }

  function off(event, layerOrCb, cb) {
    const key = cb ? `${event}:${layerOrCb}` : event
    const handler = cb ?? layerOrCb
    listeners[key] = (listeners[key] ?? []).filter((fn) => fn !== handler)
  }

  // once() must only call cb one time, unlike on() — unsubscribe via the
  // same off() a caller would use, right before running cb.
  function once(event, cb) {
    const wrapped = (eventObj) => {
      off(event, wrapped)
      cb(eventObj)
    }
    on(event, wrapped)
  }

  return {
    fitBounds: vi.fn(),
    getSource: vi.fn().mockReturnValue(null),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getLayer: vi.fn().mockReturnValue(true),
    getStyle: vi.fn().mockReturnValue({ layers: [] }),
    moveLayer: vi.fn(),
    isSourceLoaded: vi.fn().mockReturnValue(true),
    queryRenderedFeatures: vi.fn().mockReturnValue([]),
    querySourceFeatures: vi.fn().mockReturnValue([]),
    setPaintProperty: vi.fn(),
    project: vi.fn().mockReturnValue({ x: 100, y: 200 }),
    getCanvas: vi.fn().mockReturnValue({ style: {} }),
    getCenter: vi.fn().mockReturnValue({ lng: 0, lat: 0 }),
    getZoom: vi.fn().mockReturnValue(10),
    on: vi.fn(on),
    once: vi.fn(once),
    off: vi.fn(off),
    _emit(event, eventObj) {
      ;(listeners[event] ?? []).forEach((fn) => fn(eventObj))
    },
    _emitLayer(event, layer, eventObj) {
      ;(listeners[`${event}:${layer}`] ?? []).forEach((fn) => fn(eventObj))
    },
    ...overrides
  }
}
