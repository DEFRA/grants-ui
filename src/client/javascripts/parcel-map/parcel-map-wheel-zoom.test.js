// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachWheelZoom } from './parcel-map-wheel-zoom.js'
import { makeMlMap } from './test-helpers.js'

describe('parcel map wheel zoom', () => {
  let ml
  let wrapper
  let container
  let canvas
  let hint
  let cleanups
  let nativeWheel
  let zoomEnabled

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

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
    ml = makeMlMap()
    container = ml.getCanvasContainer()
    canvas = ml.getCanvas()
    wrapper = document.createElement('div')
    wrapper.appendChild(container)
    document.body.appendChild(wrapper)
    zoomEnabled = false
    ml.scrollZoom.enable.mockImplementation(() => {
      zoomEnabled = true
    })
    ml.scrollZoom.disable.mockImplementation(() => {
      zoomEnabled = false
    })
    // Mirror MapLibre's bubbling handler. Register first to prove the gate
    // runs in capture, before native zoom cancels page scrolling.
    nativeWheel = vi.fn((event) => {
      if (zoomEnabled) {
        event.preventDefault()
      }
    })
    container.addEventListener('wheel', nativeWheel)
    cleanups = []
    attachWheelZoom(ml, cleanups, wrapper)
    hint = wrapper.querySelector('.parcel-map-wheel-hint')
  })

  afterEach(() => {
    cleanups.forEach((cleanup) => cleanup())
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    ['mouse wheel', { deltaY: 100 }],
    ['two-finger vertical scroll', { deltaY: 1.5 }],
    ['two-finger diagonal scroll', { deltaY: 1.5, deltaX: 0.5 }],
    ['two-finger horizontal scroll', { deltaY: 0, deltaX: 100 }],
    ['line-based scroll', { deltaY: 0.05, deltaMode: window.WheelEvent.DOM_DELTA_LINE }],
    ['Shift + scroll', { shiftKey: true }],
    ['Alt + scroll', { altKey: true }]
  ])('allows %s without a modifier to scroll the page', (_name, options) => {
    expect(wheel(options).defaultPrevented).toBe(false)
    expect(nativeWheel).not.toHaveBeenCalled()
    expect(ml.panBy).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(true)
  })

  it.each([
    ['Ctrl + mouse wheel', { ctrlKey: true }],
    ['Command + mouse wheel', { metaKey: true }],
    ['Ctrl + two-finger scroll', { ctrlKey: true, deltaY: 1.5 }],
    ['Command + two-finger scroll', { metaKey: true, deltaY: -1.5 }],
    ['diagonal two-finger scroll', { metaKey: true, deltaX: 0.5, deltaY: 1.5 }],
    ['touchpad pinch', { ctrlKey: true, deltaY: -1.5 }],
    ['pinch while Command is held', { ctrlKey: true, metaKey: true, deltaY: -1.5 }],
    ['ambiguous scroll delta', { ctrlKey: true, deltaY: 20 }],
    ['fine line-based scroll', { ctrlKey: true, deltaY: 0.05, deltaMode: window.WheelEvent.DOM_DELTA_LINE }],
    ['line-based wheel', { ctrlKey: true, deltaMode: window.WheelEvent.DOM_DELTA_LINE }],
    ['page-based wheel', { ctrlKey: true, deltaMode: window.WheelEvent.DOM_DELTA_PAGE }]
  ])('passes %s to native zoom without panning or scrolling the page', (_name, options) => {
    const event = wheel(options)

    expect(nativeWheel).toHaveBeenCalledExactlyOnceWith(event)
    expect(event.defaultPrevented).toBe(true)
    expect(ml.panBy).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(true)
  })

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    'leaves horizontal-only and zero-delta modifier events to the browser: %o',
    (modifier) => {
      expect(wheel({ ...modifier, deltaX: 100, deltaY: 0 }).defaultPrevented).toBe(false)
      expect(wheel({ ...modifier, deltaY: 0 }).defaultPrevented).toBe(false)
      expect(nativeWheel).not.toHaveBeenCalled()
      expect(ml.panBy).not.toHaveBeenCalled()
    }
  )

  it('returns to page scrolling on the first event after releasing the modifier', () => {
    wheel({ metaKey: true, deltaY: 2 })
    nativeWheel.mockClear()

    expect(wheel({ deltaY: 2 }).defaultPrevented).toBe(false)
    expect(nativeWheel).not.toHaveBeenCalled()
    expect(zoomEnabled).toBe(true)
  })

  it('keeps two-finger scrolling as zoom when momentum deltas increase', () => {
    for (const deltaY of [1.5, 10, 120]) {
      wheel({ metaKey: true, deltaY })
      vi.advanceTimersByTime(16)
    }

    expect(nativeWheel).toHaveBeenCalledTimes(3)
    expect(ml.panBy).not.toHaveBeenCalled()
  })

  it.each([
    ['wheel', -4.000244140625],
    ['touchpad scroll', -1.5],
    ['ambiguous wheel delta', -20]
  ])('finishes native %s zoom after ordinary scrolling and accepts another zoom', async (_name, deltaY) => {
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
    attachWheelZoom(ml, cleanups, wrapper)
    cleanups.push(() => ml.scrollZoom.reset())

    wheel({ metaKey: true, deltaY })
    vi.advanceTimersByTime(deltaY === -4.000244140625 ? 16 : 0)
    const beforeScroll = ml.transform.zoom
    expect(wheel({ deltaY: 2 }).defaultPrevented).toBe(false)
    vi.advanceTimersByTime(450)

    expect(ml.transform.zoom).toBeGreaterThan(beforeScroll)
    expect(ml.scrollZoom.isZooming()).toBe(false)
    const finishedZoom = ml.transform.zoom
    wheel({ metaKey: true, deltaY: -4.000244140625 })
    vi.advanceTimersByTime(450)
    expect(ml.transform.zoom).toBeGreaterThan(finishedZoom)
    expect(ml.scrollZoom.isZooming()).toBe(false)
  })

  it('renders a visible, accessible hint in a row after the map before any scrolling', () => {
    expect(container.nextElementSibling).toBe(hint)
    expect(container.contains(hint)).toBe(false)
    expect(hint.hidden).toBe(false)
    expect(hint.hasAttribute('aria-hidden')).toBe(false)
    expect(hint.textContent).toBe('Hold the Ctrl key and scroll to zoom')
  })

  it.each([
    ['MacIntel', 'Hold the ⌘ command key and scroll to zoom'],
    ['Win32', 'Hold the Ctrl key and scroll to zoom'],
    ['Linux x86_64', 'Hold the Ctrl key and scroll to zoom']
  ])('uses the platform modifier in the persistent hint on %s', (platform, message) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []
    attachWheelZoom(ml, cleanups, wrapper)

    expect(wrapper.querySelector('.parcel-map-wheel-hint').textContent).toBe(message)
  })

  it('keeps the hint visible after scrolling, zooming, leaving the map and waiting', () => {
    wheel({ deltaY: 2 })
    wheel({ metaKey: true, deltaY: 2 })
    wheel({ ctrlKey: true, deltaY: -2 })
    container.dispatchEvent(new window.MouseEvent('mouseleave'))
    window.dispatchEvent(new Event('blur'))
    vi.advanceTimersByTime(10000)

    expect(hint.hidden).toBe(false)
    expect(hint.textContent).toBe('Hold the Ctrl key and scroll to zoom')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['iPhone', 'Linux armv8l', 'MacIntel', 'Win32'])(
    'uses touch guidance for mobile and tablet input on %s',
    (platform) => {
      vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
      cleanups.forEach((cleanup) => cleanup())
      cleanups = []
      attachWheelZoom(ml, cleanups, wrapper, true)

      expect(wrapper.querySelector('.parcel-map-wheel-hint').textContent).toBe('Use two fingers to move or zoom')
    }
  )

  it('reads deltaMode before the delta values', () => {
    const event = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true })
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
        return 0.05
      }
    })
    canvas.dispatchEvent(event)

    expect(nativeWheel).toHaveBeenCalledExactlyOnceWith(event)
    expect(event.deltaMode).toBe(1)
    expect(event.deltaY).toBe(0.05)
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
    }
  )

  it('removes the hint and wheel gate on teardown', () => {
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []

    expect(wrapper.querySelector('.parcel-map-wheel-hint')).toBeNull()
    const event = wheel({ ctrlKey: true })
    expect(nativeWheel).toHaveBeenCalledExactlyOnceWith(event)
    expect(event.defaultPrevented).toBe(false)
    expect(zoomEnabled).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
