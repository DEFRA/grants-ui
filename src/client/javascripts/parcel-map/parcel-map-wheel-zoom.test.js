// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeMlMap } from './test-helpers.js'

describe('parcel map wheel zoom', () => {
  let ml
  let container
  let canvas
  let hint
  let cleanups
  let nativeWheel
  let zoomEnabled
  let attachWheelZoom

  const pressCtrl = () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))

  const wheel = (options = {}) => {
    const event = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100, ...options })
    canvas.dispatchEvent(event)
    return event
  }

  beforeEach(async () => {
    vi.resetModules()
    ;({ attachWheelZoom } = await import('./parcel-map-wheel-zoom.js'))
    vi.useFakeTimers()
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
    ml = makeMlMap()
    container = ml.getCanvasContainer()
    canvas = ml.getCanvas()
    document.body.appendChild(container)
    zoomEnabled = false
    ml.scrollZoom.enable.mockImplementation(() => {
      zoomEnabled = true
    })
    ml.scrollZoom.disable.mockImplementation(() => {
      zoomEnabled = false
    })
    // Mirror MapLibre's bubbling handler: only enabled wheel zoom cancels
    // native scrolling. Register first to prove the gate runs in capture.
    nativeWheel = vi.fn((event) => {
      if (zoomEnabled) {
        event.preventDefault()
      }
    })
    container.addEventListener('wheel', nativeWheel)
    cleanups = []
    attachWheelZoom(ml, cleanups)
    hint = container.querySelector('.parcel-map-wheel-hint')
  })

  afterEach(() => {
    cleanups.forEach((cleanup) => cleanup())
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    ['mouse wheel', { deltaY: 100 }],
    ['touchpad scroll', { deltaY: 1.5, deltaX: 0.5 }],
    ['Shift + scroll', { shiftKey: true }],
    ['Alt + scroll', { altKey: true }]
  ])('allows %s to scroll the page and shows a hint', (_name, options) => {
    const event = wheel(options)

    expect(event.defaultPrevented).toBe(false)
    expect(nativeWheel).toHaveBeenCalledWith(event)
    expect(zoomEnabled).toBe(false)
    expect(hint.hidden).toBe(false)
    expect(hint.textContent).toMatch(/^Hold Ctrl and scroll( with two fingers to move| to zoom) the map$/)
    expect(hint.childElementCount).toBe(0)
  })

  it.each([
    ['Ctrl + mouse wheel', { ctrlKey: true }],
    ['Cmd + mouse wheel', { metaKey: true }],
    ['touchpad pinch', { ctrlKey: true, deltaY: -1.5 }],
    ['line-based wheel', { ctrlKey: true, deltaMode: window.WheelEvent.DOM_DELTA_LINE }],
    ['page-based wheel', { ctrlKey: true, deltaMode: window.WheelEvent.DOM_DELTA_PAGE }]
  ])('passes %s to native zoom and prevents page scrolling', (_name, options) => {
    wheel()
    const event = wheel(options)

    expect(zoomEnabled).toBe(true)
    expect(nativeWheel).toHaveBeenCalledWith(event)
    expect(event.defaultPrevented).toBe(true)
    expect(hint.hidden).toBe(true)
  })

  it('returns to page scrolling on the first event after releasing the modifier', () => {
    wheel({ ctrlKey: true })

    expect(wheel().defaultPrevented).toBe(false)
    expect(zoomEnabled).toBe(false)
  })

  it('allows ordinary horizontal touchpad scrolling to move the page and shows the hint', () => {
    expect(wheel({ deltaY: 0, deltaX: 100 }).defaultPrevented).toBe(false)
    expect(ml.panBy).not.toHaveBeenCalled()
    expect(hint.hidden).toBe(false)
  })

  it('shows Cmd in the hint on Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const otherMap = makeMlMap()
    attachWheelZoom(otherMap, cleanups)
    const otherContainer = otherMap.getCanvasContainer()
    otherMap.getCanvas().dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, deltaY: 10 }))

    expect(otherContainer.querySelector('.parcel-map-wheel-hint').textContent).toBe(
      'Hold Cmd and scroll with two fingers to move the map'
    )
  })

  it.each(['Win32', 'Linux x86_64'])('uses Ctrl guidance and modifier gestures on %s', (platform) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []
    attachWheelZoom(ml, cleanups)
    hint = container.querySelector('.parcel-map-wheel-hint')

    expect(wheel().defaultPrevented).toBe(false)
    expect(hint.textContent).toBe('Hold Ctrl and scroll to zoom the map')
    pressCtrl()
    expect(wheel({ ctrlKey: true, deltaY: 120 }).defaultPrevented).toBe(true)
    expect(zoomEnabled).toBe(true)
    expect(wheel({ ctrlKey: true, deltaX: 1.5, deltaY: 2.5 }).defaultPrevented).toBe(true)
    expect(ml.panBy).toHaveBeenCalledWith([1.5, 2.5], { duration: 0 })
    expect(zoomEnabled).toBe(false)
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Control' }))
    expect(wheel({ deltaY: 2.5 }).defaultPrevented).toBe(false)
    expect(hint.hidden).toBe(true)
  })

  it('reads deltaMode before the delta values', () => {
    const event = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 3, deltaMode: 1 })
    let modeRead = false
    Object.defineProperty(event, 'deltaMode', {
      get: () => {
        modeRead = true
        return 1
      }
    })
    Object.defineProperty(event, 'deltaY', {
      get: () => {
        expect(modeRead).toBe(true)
        return 3
      }
    })

    canvas.dispatchEvent(event)
    expect(modeRead).toBe(true)
  })

  it.each([
    ['vertical', { deltaX: 0, deltaY: 0.25 }, [0, 10]],
    ['horizontal', { deltaX: -0.5, deltaY: 0 }, [-20, 0]],
    ['diagonal', { deltaX: 0.25, deltaY: -0.5 }, [10, -20]]
  ])('normalises fine line-based %s touchpad scrolling for panning', (_name, deltas, offset) => {
    const options = { ...deltas, deltaMode: window.WheelEvent.DOM_DELTA_LINE }
    expect(wheel(options).defaultPrevented).toBe(false)
    expect(hint.textContent).toBe('Hold Ctrl and scroll with two fingers to move the map')
    pressCtrl()
    expect(wheel({ ...options, ctrlKey: true }).defaultPrevented).toBe(true)

    expect(ml.panBy).toHaveBeenCalledWith(offset, { duration: 0 })
    expect(zoomEnabled).toBe(false)
  })

  it('keeps faster line-based scrolling in the same touchpad gesture', () => {
    pressCtrl()
    wheel({ ctrlKey: true, deltaY: 0.1, deltaMode: window.WheelEvent.DOM_DELTA_LINE })
    wheel({ ctrlKey: true, deltaY: 3, deltaMode: window.WheelEvent.DOM_DELTA_LINE })

    expect(ml.panBy).toHaveBeenLastCalledWith([0, 120], { duration: 0 })
    expect(zoomEnabled).toBe(false)
  })

  it('leaves discrete line-based horizontal wheel movement to the browser', () => {
    pressCtrl()
    const event = wheel({ ctrlKey: true, deltaX: 3, deltaY: 0, deltaMode: window.WheelEvent.DOM_DELTA_LINE })

    expect(event.defaultPrevented).toBe(false)
    expect(ml.panBy).not.toHaveBeenCalled()
  })

  it.each([
    ['Ctrl + vertical touchpad scroll', { ctrlKey: true, deltaY: 10 }, [0, 10]],
    ['Cmd + vertical touchpad scroll', { metaKey: true, deltaY: -10 }, [0, -10]],
    ['Ctrl + horizontal touchpad scroll', { ctrlKey: true, deltaX: 100, deltaY: 0 }, [100, 0]],
    ['Cmd + horizontal touchpad scroll', { metaKey: true, deltaX: -100, deltaY: 0 }, [-100, 0]],
    ['Ctrl + diagonal touchpad scroll', { ctrlKey: true, deltaX: 0.5, deltaY: 1.5 }, [0.5, 1.5]],
    ['Cmd + diagonal touchpad scroll', { metaKey: true, deltaX: -20, deltaY: 120 }, [-20, 120]]
  ])('pans for %s without zooming or scrolling the page', (_name, options, offset) => {
    pressCtrl()
    const event = wheel(options)

    expect(ml.panBy).toHaveBeenCalledWith(offset, { duration: 0 })
    expect(event.defaultPrevented).toBe(true)
    expect(zoomEnabled).toBe(false)
    expect(hint.hidden).toBe(true)
  })

  it('keeps faster vertical touchpad movement in the same panning gesture', () => {
    wheel({ deltaY: 2 })
    pressCtrl()
    wheel({ deltaY: 120, ctrlKey: true })

    expect(ml.panBy).toHaveBeenCalledWith([0, 120], { duration: 0 })
    expect(zoomEnabled).toBe(false)
  })

  it('recognises a mouse wheel after the touchpad gesture ends', () => {
    wheel({ deltaY: 2 })
    vi.advanceTimersByTime(401)
    pressCtrl()
    wheel({ deltaY: 120, ctrlKey: true })

    expect(ml.panBy).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(true)
  })

  it.each([
    ['one line', { deltaY: 1, deltaMode: window.WheelEvent.DOM_DELTA_LINE }],
    ['line mode', { deltaY: 3, deltaMode: window.WheelEvent.DOM_DELTA_LINE }],
    ['page mode', { deltaY: 1, deltaMode: window.WheelEvent.DOM_DELTA_PAGE }],
    ['macOS mouse-wheel step', { deltaY: 4.000244140625 }],
    ['macOS multiple mouse-wheel steps', { deltaY: -8.00048828125 }]
  ])('keeps %s as wheel zoom even with small deltas', (_name, options) => {
    pressCtrl()
    wheel({ ...options, ctrlKey: true })

    expect(ml.panBy).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(true)
  })

  it('keeps browser pinch zoom when Cmd is held', () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Meta', metaKey: true }))
    wheel({ ctrlKey: true, metaKey: true, deltaY: -2 })

    expect(ml.panBy).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(true)
  })

  it('restores page scrolling immediately when the panning modifier is released', () => {
    pressCtrl()
    wheel({ ctrlKey: true, deltaY: 10 })
    ml.panBy.mockClear()
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Control' }))

    expect(wheel({ deltaY: 10 }).defaultPrevented).toBe(false)
    expect(ml.panBy).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(false)
  })

  it('clears physical key state when the window loses focus, preserving subsequent pinch zoom', () => {
    pressCtrl()
    window.dispatchEvent(new Event('blur'))
    wheel({ ctrlKey: true, deltaY: -2 })

    expect(ml.panBy).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(true)
  })

  it('ignores wheel events without movement', () => {
    pressCtrl()
    wheel({ ctrlKey: true, deltaX: 0, deltaY: 0 })

    expect(ml.panBy).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(false)
    expect(hint.hidden).toBe(true)
  })

  it('hides the hint three seconds after the last ordinary scroll', () => {
    wheel()
    vi.advanceTimersByTime(1000)
    wheel()
    vi.advanceTimersByTime(2500)
    expect(hint.hidden).toBe(false)
    vi.advanceTimersByTime(500)
    expect(hint.hidden).toBe(true)
  })

  it('shows the hint again immediately on scrolling after it hides', () => {
    wheel()
    vi.advanceTimersByTime(3000)
    expect(hint.hidden).toBe(true)
    wheel()
    expect(hint.hidden).toBe(false)
  })

  it('keeps showing the hint until modifier use, including after more than three reminders', () => {
    for (let i = 0; i < 5; i++) {
      wheel()
      expect(hint.hidden).toBe(false)
      vi.advanceTimersByTime(3000)
      expect(hint.hidden).toBe(true)
    }
  })

  it('updates visible guidance when scrolling switches from mouse wheel to touchpad', () => {
    wheel()
    expect(hint.textContent).toBe('Hold Ctrl and scroll to zoom the map')
    wheel({ deltaY: 1.5 })
    expect(hint.textContent).toBe('Hold Ctrl and scroll with two fingers to move the map')
    expect(vi.getTimerCount()).toBe(1)
  })

  it.each([
    ['Ctrl mouse-wheel zoom', { ctrlKey: true, deltaY: 120 }],
    ['Cmd mouse-wheel zoom', { metaKey: true, deltaY: 120 }],
    ['Ctrl touchpad pan', { ctrlKey: true, deltaY: 10 }],
    ['Cmd touchpad pan', { metaKey: true, deltaY: 10 }]
  ])('stops reminders for this page after %s', (_name, options) => {
    wheel()
    pressCtrl()
    wheel(options)
    expect(hint.hidden).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60000)
    expect(wheel().defaultPrevented).toBe(false)
    expect(hint.hidden).toBe(true)
  })

  it.each([false, true])('does not permanently dismiss reminders after pinch zoom (Cmd held: %s)', (metaKey) => {
    wheel({ ctrlKey: true, metaKey, deltaY: -2 })
    wheel()

    expect(hint.hidden).toBe(false)
  })

  it('remembers modifier use if the map is recreated on the same page', () => {
    pressCtrl()
    wheel({ ctrlKey: true })
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []
    attachWheelZoom(ml, cleanups)
    wheel()

    expect(container.querySelector('.parcel-map-wheel-hint').hidden).toBe(true)
  })

  it('remembers modifier use across maps on the same page', () => {
    pressCtrl()
    wheel({ ctrlKey: true })
    const otherMap = makeMlMap()
    attachWheelZoom(otherMap, cleanups)
    otherMap.getCanvas().dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, deltaY: 120 }))

    expect(otherMap.getCanvasContainer().querySelector('.parcel-map-wheel-hint').hidden).toBe(true)
  })

  it('hides the hint when the pointer leaves the map', () => {
    wheel()
    container.dispatchEvent(new window.MouseEvent('mouseleave'))

    expect(hint.hidden).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts with a hidden hint outside the accessibility tree', () => {
    expect(hint.hidden).toBe(true)
    expect(hint.getAttribute('aria-hidden')).toBe('true')
  })

  it.each(['keydown', 'touchstart', 'touchmove', 'click'])('leaves %s events untouched', (type) => {
    const listener = vi.fn()
    container.addEventListener(type, listener)
    const event = new Event(type, { bubbles: true, cancelable: true })
    canvas.dispatchEvent(event)

    expect(listener).toHaveBeenCalledWith(event)
    expect(event.defaultPrevented).toBe(false)
    expect(ml.scrollZoom.enable).not.toHaveBeenCalled()
    expect(hint.hidden).toBe(true)
  })

  it('removes listeners, hint and timers on teardown', () => {
    wheel()
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []

    expect(container.querySelector('.parcel-map-wheel-hint')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(wheel({ ctrlKey: true }).defaultPrevented).toBe(false)
    expect(zoomEnabled).toBe(false)
  })
})
