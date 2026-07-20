// @ts-nocheck
import { vi } from 'vitest'

export function makeMlMap(overrides = {}) {
  const listeners = {}
  return {
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
}
