// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Point from '@mapbox/point-geometry'
import { CooperativeGesturesHandler } from 'maplibre-gl/src/ui/handler/cooperative_gestures.ts'
import { TouchPanHandler } from 'maplibre-gl/src/ui/handler/touch_pan.ts'
import { TwoFingersTouchZoomHandler } from 'maplibre-gl/src/ui/handler/two_fingers_touch.ts'
import { makeMlMap } from './test-helpers.js'

// Exercise the native handlers used by cooperativeGestures in parcel-map-init.
describe('parcel map cooperative touch gestures', () => {
  let ml
  let pan
  let zoom
  const touches = [{ identifier: 0 }, { identifier: 1 }]
  const touchEvent = (type) => new Event(type, { cancelable: true })

  beforeEach(() => {
    vi.useFakeTimers()
    ml = makeMlMap({ _getUIString: (key) => key, fire: vi.fn() })
    ml.cooperativeGestures = new CooperativeGesturesHandler(ml, true)
    ml.cooperativeGestures.enable()
    pan = new TouchPanHandler({ clickTolerance: 1 }, ml)
    pan.enable()
    zoom = new TwoFingersTouchZoomHandler()
    zoom.enable()
  })

  afterEach(() => {
    ml.cooperativeGestures.disable()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('leaves single-finger swipes to page scrolling without panning the map', () => {
    pan.touchstart(touchEvent('touchstart'), [new Point(10, 10)], touches.slice(0, 1))
    const move = touchEvent('touchmove')
    const result = pan.touchmove(move, [new Point(10, 50)], touches.slice(0, 1))

    expect(move.defaultPrevented).toBe(false)
    expect(result).toBeUndefined()
    expect(ml.getCanvasContainer().classList.contains('maplibregl-cooperative-gestures')).toBe(true)
  })

  it('pans with a two-finger drag and prevents page scrolling', () => {
    pan.touchstart(touchEvent('touchstart'), [new Point(10, 10), new Point(30, 10)], touches)
    const move = touchEvent('touchmove')
    const result = pan.touchmove(move, [new Point(10, 50), new Point(30, 50)], touches)

    expect(move.defaultPrevented).toBe(true)
    expect(result.panDelta).toEqual(new Point(0, 40))
  })

  it('returns to page scrolling when a finger is lifted after panning', () => {
    pan.touchstart(touchEvent('touchstart'), [new Point(10, 10), new Point(30, 10)], touches)
    pan.touchmove(touchEvent('touchmove'), [new Point(10, 50), new Point(30, 50)], touches)
    pan.touchend(touchEvent('touchend'), [new Point(10, 50)], touches.slice(0, 1))
    const move = touchEvent('touchmove')
    const result = pan.touchmove(move, [new Point(10, 80)], touches.slice(0, 1))

    expect(move.defaultPrevented).toBe(false)
    expect(result).toBeUndefined()
  })

  it.each([
    ['apart', 40, 1],
    ['together', 10, -1]
  ])('zooms when two fingers pinch %s', (_direction, distance, expectedDelta) => {
    zoom.touchstart(touchEvent('touchstart'), [new Point(0, 0), new Point(20, 0)], touches)
    const move = touchEvent('touchmove')
    const result = zoom.touchmove(move, [new Point(0, 0), new Point(distance, 0)], touches)

    expect(move.defaultPrevented).toBe(true)
    expect(result.zoomDelta).toBeCloseTo(expectedDelta)
  })
})
