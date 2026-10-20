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
    const event = new window.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 4.000244140625,
      ...options
    })
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
    expect(nativeWheel).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(true)
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

    nativeWheel.mockClear()
    expect(wheel().defaultPrevented).toBe(false)
    expect(nativeWheel).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(true)
  })

  it.each(['wheel', 'pinch'])('keeps native zoom enabled after %s and subsequent ordinary scrolling', (gesture) => {
    if (gesture === 'wheel') {
      pressCtrl()
    }
    const firstZoom = wheel({ ctrlKey: true })
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Control' }))
    const pageScroll = wheel({ deltaY: 2 })
    const nextZoom = wheel({ ctrlKey: true })

    expect(nativeWheel.mock.calls.map(([event]) => event)).toEqual([firstZoom, nextZoom])
    expect(pageScroll.defaultPrevented).toBe(false)
    expect(ml.scrollZoom.enable).toHaveBeenCalledOnce()
    expect(ml.scrollZoom.disable).not.toHaveBeenCalled()
  })

  it.each(['wheel', 'pinch', 'buffered wheel'])(
    'finishes native %s zoom and accepts another zoom after ordinary scrolling',
    async (type) => {
      const { ScrollZoomHandler } = await import('maplibre-gl/src/ui/handler/scroll_zoom.ts')
      cleanups.forEach((cleanup) => cleanup())
      cleanups = []
      container.removeEventListener('wheel', nativeWheel)
      ml.transform = {
        zoom: 10,
        scale: 1024,
        getCameraLngLat: () => ({ lng: 0, lat: 0 }),
        applyConstrain: (_center, zoom) => ({ zoom })
      }
      ml.getZoomSnap = () => 0
      ml.cooperativeGestures = { isEnabled: () => false }
      let framePending = false
      const render = () => {
        if (framePending) {
          return
        }
        framePending = true
        globalThis.setTimeout(() => {
          framePending = false
          // HandlerManager skips disabled handlers, including animation frames.
          if (!ml.scrollZoom.isEnabled()) {
            return
          }
          const result = ml.scrollZoom.renderFrame()
          if (result) {
            ml.transform.zoom += result.zoomDelta
            ml.transform.scale = 2 ** ml.transform.zoom
            if (result.needsRenderFrame) {
              render()
            }
          }
        }, 16)
      }
      ml.scrollZoom = new ScrollZoomHandler(ml, render)
      container.addEventListener('wheel', (event) => ml.scrollZoom.wheel(event))
      attachWheelZoom(ml, cleanups)
      cleanups.push(() => ml.scrollZoom.reset())
      if (type !== 'pinch') {
        pressCtrl()
      }
      const deltaY = type === 'buffered wheel' ? -20 : type === 'wheel' ? -4.000244140625 : -1.5
      wheel({ ctrlKey: true, deltaY })
      if (type === 'wheel') {
        vi.advanceTimersByTime(16)
      } else if (type === 'buffered wheel') {
        vi.advanceTimersByTime(40)
      }
      window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Control' }))
      const beforeScroll = ml.transform.zoom
      expect(wheel({ deltaY: 2 }).defaultPrevented).toBe(false)
      vi.advanceTimersByTime(450)

      expect(ml.transform.zoom).toBeGreaterThan(beforeScroll)
      expect(ml.scrollZoom.isZooming()).toBe(false)
      const finishedZoom = ml.transform.zoom
      pressCtrl()
      wheel({ ctrlKey: true, deltaY: -4.000244140625 })
      vi.advanceTimersByTime(450)
      expect(ml.transform.zoom).toBeGreaterThan(finishedZoom)
      expect(ml.scrollZoom.isZooming()).toBe(false)
    }
  )

  it.each([4, 10, 20, 39])('zooms for an isolated %spx mouse-wheel tick after classification', (deltaY) => {
    pressCtrl()
    const event = wheel({ ctrlKey: true, deltaY, clientX: 25, clientY: 50 })

    expect(event.defaultPrevented).toBe(true)
    expect(nativeWheel).not.toHaveBeenCalled()
    expect(ml.panBy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(39)
    expect(nativeWheel).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(nativeWheel).toHaveBeenCalledExactlyOnceWith(event)
    expect(event.target).toBe(canvas)
    expect(event.clientX).toBe(25)
    expect(event.clientY).toBe(50)
    expect(ml.panBy).not.toHaveBeenCalled()
  })

  it.each([
    [19, true],
    [20, false],
    [30, false]
  ])('classifies repeated 10px events %sms apart (touchpad: %s)', (gap, touchpad) => {
    pressCtrl()
    const first = wheel({ ctrlKey: true, deltaY: 10 })
    vi.advanceTimersByTime(gap)
    const second = wheel({ ctrlKey: true, deltaY: 10 })

    if (touchpad) {
      expect(ml.panBy.mock.calls).toEqual([
        [[0, 10], { duration: 0 }],
        [[0, 10], { duration: 0 }]
      ])
      expect(nativeWheel).not.toHaveBeenCalled()
    } else {
      expect(nativeWheel.mock.calls.map(([event]) => event)).toEqual([first, second])
      expect(ml.panBy).not.toHaveBeenCalled()
    }
    vi.advanceTimersByTime(40)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps a fast trackpad gesture panning when its momentum deltas increase', () => {
    pressCtrl()
    wheel({ ctrlKey: true, deltaY: 10 })
    vi.advanceTimersByTime(10)
    wheel({ ctrlKey: true, deltaY: 10 })
    vi.advanceTimersByTime(16)
    wheel({ ctrlKey: true, deltaY: 120 })

    expect(ml.panBy).toHaveBeenLastCalledWith([0, 120], { duration: 0 })
    expect(nativeWheel).not.toHaveBeenCalled()
  })

  it('uses ordinary scroll timing to classify a trackpad before the modifier is pressed', () => {
    expect(wheel({ deltaY: 10 }).defaultPrevented).toBe(false)
    vi.advanceTimersByTime(10)
    pressCtrl()
    const event = wheel({ ctrlKey: true, deltaY: 10 })

    expect(event.defaultPrevented).toBe(true)
    expect(ml.panBy).toHaveBeenCalledExactlyOnceWith([0, 10], { duration: 0 })
    expect(nativeWheel).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps reminders until an ambiguous modifier gesture is classified', () => {
    wheel()
    vi.advanceTimersByTime(401)
    pressCtrl()
    wheel({ ctrlKey: true, deltaY: 20 })

    expect(hint.hidden).toBe(false)
    vi.advanceTimersByTime(40)
    expect(hint.hidden).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves the original line units when an ambiguous event resolves to wheel zoom', () => {
    pressCtrl()
    const event = wheel({ ctrlKey: true, deltaY: 0.25, deltaMode: window.WheelEvent.DOM_DELTA_LINE })
    vi.advanceTimersByTime(40)

    expect(nativeWheel).toHaveBeenCalledExactlyOnceWith(event)
    expect(event.deltaY).toBe(0.25)
    expect(event.deltaMode).toBe(window.WheelEvent.DOM_DELTA_LINE)
    expect(ml.panBy).not.toHaveBeenCalled()
  })

  it('normalises buffered line-based events once when timing identifies a trackpad', () => {
    pressCtrl()
    wheel({ ctrlKey: true, deltaY: 0.25, deltaMode: window.WheelEvent.DOM_DELTA_LINE })
    vi.advanceTimersByTime(10)
    wheel({ ctrlKey: true, deltaY: 0.25, deltaMode: window.WheelEvent.DOM_DELTA_LINE })

    expect(ml.panBy.mock.calls).toEqual([
      [[0, 10], { duration: 0 }],
      [[0, 10], { duration: 0 }]
    ])
    expect(nativeWheel).not.toHaveBeenCalled()
  })

  it.each(['blur', 'teardown'])('cancels buffered wheel events on %s', (reason) => {
    pressCtrl()
    wheel({ ctrlKey: true, deltaY: 20 })
    if (reason === 'blur') {
      window.dispatchEvent(new Event('blur'))
    } else {
      cleanups.forEach((cleanup) => cleanup())
      cleanups = []
    }
    vi.advanceTimersByTime(40)

    expect(nativeWheel).not.toHaveBeenCalled()
    expect(ml.panBy).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
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
    otherMap.getCanvas().dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, deltaY: 2 }))

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
    expect(zoomEnabled).toBe(true)
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
    ['vertical', { deltaX: 0, deltaY: 0.05 }, [0, 2]],
    ['horizontal', { deltaX: -0.5, deltaY: 0 }, [-20, 0]],
    ['diagonal', { deltaX: 0.25, deltaY: -0.5 }, [10, -20]]
  ])('normalises fine line-based %s touchpad scrolling for panning', (_name, deltas, offset) => {
    const options = { ...deltas, deltaMode: window.WheelEvent.DOM_DELTA_LINE }
    expect(wheel(options).defaultPrevented).toBe(false)
    expect(hint.textContent).toBe('Hold Ctrl and scroll with two fingers to move the map')
    pressCtrl()
    expect(wheel({ ...options, ctrlKey: true }).defaultPrevented).toBe(true)

    expect(ml.panBy).toHaveBeenCalledWith(offset, { duration: 0 })
    expect(nativeWheel).not.toHaveBeenCalled()
  })

  it('keeps faster line-based scrolling in the same touchpad gesture', () => {
    pressCtrl()
    wheel({ ctrlKey: true, deltaY: 0.05, deltaMode: window.WheelEvent.DOM_DELTA_LINE })
    wheel({ ctrlKey: true, deltaY: 3, deltaMode: window.WheelEvent.DOM_DELTA_LINE })

    expect(ml.panBy).toHaveBeenLastCalledWith([0, 120], { duration: 0 })
    expect(nativeWheel).not.toHaveBeenCalled()
  })

  it('leaves discrete line-based horizontal wheel movement to the browser', () => {
    pressCtrl()
    const event = wheel({ ctrlKey: true, deltaX: 3, deltaY: 0, deltaMode: window.WheelEvent.DOM_DELTA_LINE })

    expect(event.defaultPrevented).toBe(false)
    expect(ml.panBy).not.toHaveBeenCalled()
  })

  it.each([
    ['Ctrl + vertical touchpad scroll', { ctrlKey: true, deltaY: 2 }, [0, 2]],
    ['Cmd + vertical touchpad scroll', { metaKey: true, deltaY: -2 }, [0, -2]],
    ['Ctrl + horizontal touchpad scroll', { ctrlKey: true, deltaX: 100, deltaY: 0 }, [100, 0]],
    ['Cmd + horizontal touchpad scroll', { metaKey: true, deltaX: -100, deltaY: 0 }, [-100, 0]],
    ['Ctrl + diagonal touchpad scroll', { ctrlKey: true, deltaX: 0.5, deltaY: 1.5 }, [0.5, 1.5]],
    ['Cmd + diagonal touchpad scroll', { metaKey: true, deltaX: -20, deltaY: 120 }, [-20, 120]]
  ])('pans for %s without zooming or scrolling the page', (_name, options, offset) => {
    pressCtrl()
    const event = wheel(options)

    expect(ml.panBy).toHaveBeenCalledWith(offset, { duration: 0 })
    expect(event.defaultPrevented).toBe(true)
    expect(nativeWheel).not.toHaveBeenCalled()
    expect(hint.hidden).toBe(true)
  })

  it('keeps faster vertical touchpad movement in the same panning gesture', () => {
    wheel({ deltaY: 2 })
    pressCtrl()
    wheel({ deltaY: 120, ctrlKey: true })

    expect(ml.panBy).toHaveBeenCalledWith([0, 120], { duration: 0 })
    expect(nativeWheel).not.toHaveBeenCalled()
  })

  it('recognises a mouse wheel after the touchpad gesture ends', () => {
    wheel({ deltaY: 2 })
    vi.advanceTimersByTime(401)
    pressCtrl()
    wheel({ deltaY: 120, ctrlKey: true })
    vi.advanceTimersByTime(40)

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
    wheel({ ctrlKey: true, deltaY: 2 })
    ml.panBy.mockClear()
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Control' }))

    expect(wheel({ deltaY: 2 }).defaultPrevented).toBe(false)
    expect(ml.panBy).not.toHaveBeenCalled()
    expect(nativeWheel).not.toHaveBeenCalled()
  })

  it('clears physical key state when the window loses focus, preserving subsequent pinch zoom', () => {
    pressCtrl()
    window.dispatchEvent(new Event('blur'))
    wheel({ ctrlKey: true, deltaY: -2 })

    expect(ml.panBy).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(true)
  })

  it.each(['pointermove', 'pointerdown'])('recovers a missed Ctrl keydown from %s after focus returns', (type) => {
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    canvas.dispatchEvent(new window.MouseEvent(type, { bubbles: true, ctrlKey: true }))
    wheel({ ctrlKey: true, deltaY: 2 })

    expect(ml.panBy).toHaveBeenCalledExactlyOnceWith([0, 2], { duration: 0 })
    expect(nativeWheel).not.toHaveBeenCalled()
  })

  it('recovers a missed Ctrl release from pointer movement and preserves pinch zoom', () => {
    pressCtrl()
    canvas.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, ctrlKey: false }))
    const event = wheel({ ctrlKey: true, deltaY: -2 })

    expect(nativeWheel).toHaveBeenCalledExactlyOnceWith(event)
    expect(ml.panBy).not.toHaveBeenCalled()
    wheel()
    expect(hint.hidden).toBe(false)
  })

  it('preserves pinch zoom when wheel input is the first event after focus returns', () => {
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    const event = wheel({ ctrlKey: true, deltaY: -2 })

    expect(nativeWheel).toHaveBeenCalledExactlyOnceWith(event)
    expect(ml.panBy).not.toHaveBeenCalled()
  })

  it('ignores wheel events without movement', () => {
    pressCtrl()
    wheel({ ctrlKey: true, deltaX: 0, deltaY: 0 })

    expect(ml.panBy).not.toHaveBeenCalled()
    expect(nativeWheel).not.toHaveBeenCalled()
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
    ['Ctrl touchpad pan', { ctrlKey: true, deltaY: 2 }],
    ['Cmd touchpad pan', { metaKey: true, deltaY: 2 }]
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

  it.each(['keydown', 'touchstart', 'touchmove', 'click', 'pointermove', 'pointerdown'])(
    'leaves %s events untouched',
    (type) => {
      const listener = vi.fn()
      container.addEventListener(type, listener)
      const event = new Event(type, { bubbles: true, cancelable: true })
      canvas.dispatchEvent(event)

      expect(listener).toHaveBeenCalledWith(event)
      expect(event.defaultPrevented).toBe(false)
      expect(ml.scrollZoom.enable).toHaveBeenCalledOnce()
      expect(hint.hidden).toBe(true)
    }
  )

  it('removes listeners, hint and timers on teardown', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener')
    wheel()
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []

    expect(container.querySelector('.parcel-map-wheel-hint')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(wheel({ ctrlKey: true }).defaultPrevented).toBe(false)
    expect(zoomEnabled).toBe(false)
    for (const type of ['keydown', 'keyup', 'pointermove', 'pointerdown']) {
      expect(removeListener).toHaveBeenCalledWith(type, expect.any(Function), true)
    }
  })
})
