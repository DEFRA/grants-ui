// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { attachResetButton } from './parcel-map-reset-button.js'
import {
  MSG_SHOW_ALL_PARCELS,
  MSG_SHOW_ALL_PARCELS_AVAILABLE,
  SHOW_ALL_BUTTON_CLASS,
  SHOW_ALL_MOVE_THRESHOLD_PX
} from './config.js'
import { makeMlMap } from './test-helpers.js'

const BBOX = { minLng: -1, minLat: 51, maxLng: 1, maxLat: 53 }
const INITIAL_CENTER = { lng: 0, lat: 52 }

function makeMapEl() {
  const wrapper = document.createElement('div')
  const mapEl = document.createElement('div')
  wrapper.appendChild(mapEl)
  document.body.appendChild(wrapper)
  return mapEl
}

const INITIAL_ZOOM = 10

/**
 * A projection where screen-pixel distance from the origin equals `offsetPx`
 * once the map has "moved" by that amount, so tests can drive centerDriftPx()
 * directly instead of reasoning about real map projections.
 */
function makeMl({ offsetPx = 0, zoom = INITIAL_ZOOM } = {}) {
  return makeMlMap({
    getCenter: vi.fn().mockReturnValue(INITIAL_CENTER),
    getZoom: vi.fn().mockReturnValue(zoom),
    project: vi.fn((lngLat) => (lngLat === INITIAL_CENTER ? { x: 0, y: 0 } : { x: offsetPx, y: 0 }))
  })
}

function makeMapInstance() {
  return { addControl: vi.fn() }
}

describe('attachResetButton', () => {
  let cleanups

  beforeEach(() => {
    document.body.innerHTML = ''
    cleanups = []
  })

  // attachFullscreenResetControl adds document-level click/fullscreenchange
  // listeners — without this, a test that doesn't explicitly clean up leaves
  // them dangling for every later test in the file to also react to.
  afterEach(() => {
    cleanups.forEach((off) => off())
  })

  it('returns undefined when the map element has no wrapper parent', () => {
    const orphan = document.createElement('div')
    expect(attachResetButton(makeMapInstance(), makeMl(), BBOX, orphan, cleanups)).toBeUndefined()
  })

  it('returns undefined when the map element is null', () => {
    expect(attachResetButton(makeMapInstance(), makeMl(), BBOX, null, cleanups)).toBeUndefined()
  })

  it('returns undefined when there is no bbox', () => {
    const mapEl = makeMapEl()
    expect(attachResetButton(makeMapInstance(), makeMl(), null, mapEl, cleanups)).toBeUndefined()
  })

  it('is hidden by default (no inline display fighting the hidden attribute) and labelled "Show all parcels"', () => {
    const mapEl = makeMapEl()
    const button = attachResetButton(makeMapInstance(), makeMl(), BBOX, mapEl, cleanups)

    expect(button.hidden).toBe(true)
    // The bug this guards: 'display:inline-flex' baked into the base cssText
    // overrides [hidden]'s UA display:none, so the button showed on load
    // regardless of the `hidden` property.
    expect(button.style.display).not.toBe('inline-flex')
    expect(button.textContent).toContain(MSG_SHOW_ALL_PARCELS)
  })

  it('carries the class the GOV.UK-style focus ring is scoped to, and injects that style once', () => {
    const mapEl = makeMapEl()
    const button = attachResetButton(makeMapInstance(), makeMl(), BBOX, mapEl, cleanups)

    expect(button.classList.contains(SHOW_ALL_BUTTON_CLASS)).toBe(true)
    expect(document.head.querySelectorAll('style[data-parcel-map-show-all-focus-style]')).toHaveLength(1)

    // A second <parcel-map> instance on the same page must not duplicate it.
    const secondCleanups = []
    attachResetButton(makeMapInstance(), makeMl(), BBOX, makeMapEl(), secondCleanups)
    expect(document.head.querySelectorAll('style[data-parcel-map-show-all-focus-style]')).toHaveLength(1)

    secondCleanups.forEach((off) => off())
  })

  it('stays hidden when drift is below the threshold (incidental nudge)', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX - 1 })
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    ml._emit('moveend')

    expect(button.hidden).toBe(true)
    expect(button.style.display).not.toBe('inline-flex')
  })

  it('shows the button once drift reaches the threshold', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    ml._emit('moveend')

    expect(button.hidden).toBe(false)
    expect(button.style.display).toBe('inline-flex')
  })

  it('hides itself immediately and triggers an animated re-fit when clicked', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    ml._emit('moveend')
    expect(button.hidden).toBe(false)

    button.click()

    expect(button.hidden).toBe(true)
    expect(button.style.display).toBe('none')
    expect(ml.fitBounds).toHaveBeenCalledWith(
      [
        [BBOX.minLng, BBOX.minLat],
        [BBOX.maxLng, BBOX.maxLat]
      ],
      expect.objectContaining({ animate: true })
    )
  })

  it('ignores the moveend fired by its own reset animation', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    ml._emit('moveend')
    expect(button.hidden).toBe(false)

    button.click()
    expect(button.hidden).toBe(true)

    // The reset animation's own moveend, still reporting drift mid-overshoot.
    ml._emit('moveend')

    expect(button.hidden).toBe(true)
  })

  it('resumes normal drift-checking on the next moveend after a reset', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    ml._emit('moveend')
    button.click()

    // The reset's own moveend is ignored...
    ml._emit('moveend')
    expect(button.hidden).toBe(true)

    // ...but a genuine subsequent user move is not.
    ml._emit('moveend')
    expect(button.hidden).toBe(false)
  })

  it('does not hide itself when the user pans back to the initial view without clicking the button', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    ml._emit('moveend')
    expect(button.hidden).toBe(false)

    // Manually panning back to the initial view doesn't itself hide the
    // button — only clicking it does.
    ml.project.mockImplementation(() => ({ x: 0, y: 0 }))
    ml._emit('moveend')

    expect(button.hidden).toBe(false)
    expect(ml.fitBounds).not.toHaveBeenCalled()
  })

  it('shows the button on a zoom change alone, even with the center unchanged', () => {
    const mapEl = makeMapEl()
    const ml = makeMl()
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    ml._emit('idle')
    ml.getZoom.mockReturnValue(INITIAL_ZOOM + 1)
    ml._emit('moveend')

    expect(button.hidden).toBe(false)
  })

  it('ignores a negligible zoom change below the tolerance', () => {
    const mapEl = makeMapEl()
    const ml = makeMl()
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    ml._emit('idle')
    ml.getZoom.mockReturnValue(INITIAL_ZOOM + 0.01)
    ml._emit('moveend')

    expect(button.hidden).toBe(true)
  })

  it('does not hide once shown, even when zoom returns to its initial-view value', () => {
    const mapEl = makeMapEl()
    const ml = makeMl()
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    ml._emit('idle')
    ml.getZoom.mockReturnValue(INITIAL_ZOOM + 1)
    ml._emit('moveend')
    expect(button.hidden).toBe(false)

    ml.getZoom.mockReturnValue(INITIAL_ZOOM)
    ml._emit('moveend')

    expect(button.hidden).toBe(false)
  })

  it("captures the initial zoom from the map's first idle, not from attach time", () => {
    const mapEl = makeMapEl()
    // Simulates fitBounds not having applied yet when attachResetButton runs.
    const ml = makeMl({ zoom: 4 })
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    // fitBounds settles after attach; idle reports the real fitted zoom.
    ml.getZoom.mockReturnValue(INITIAL_ZOOM)
    ml._emit('idle')
    ml._emit('moveend')

    expect(button.hidden).toBe(true)
  })

  it("captures the initial center from the map's first idle, since fitBounds padding can shift it off the bbox midpoint", () => {
    const mapEl = makeMapEl()
    const ml = makeMl()
    // Real fitted center, deliberately different from the bbox midpoint.
    const fittedCenter = { lng: 0.4, lat: 52.3 }
    ml.getCenter.mockReturnValue(fittedCenter)
    ml.project.mockImplementation((lngLat) => (lngLat === fittedCenter ? { x: 0, y: 0 } : { x: 999, y: 0 }))

    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)
    ml._emit('idle')

    // The map is still exactly at the real fitted center, not the bbox
    // midpoint — the button should stay hidden.
    ml._emit('moveend')

    expect(button.hidden).toBe(true)
  })

  it('announces the button becoming available via a visually-hidden live region', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)
    const announcer = mapEl.parentElement.querySelector('[role="status"]')

    expect(announcer).not.toBeNull()
    expect(announcer.textContent).toBe('')

    ml._emit('moveend')

    expect(announcer.textContent).toBe(MSG_SHOW_ALL_PARCELS_AVAILABLE)
  })

  it('clears the announcement once the button is clicked', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    const button = attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)
    const announcer = mapEl.parentElement.querySelector('[role="status"]')

    ml._emit('moveend')
    expect(announcer.textContent).toBe(MSG_SHOW_ALL_PARCELS_AVAILABLE)

    button.click()

    expect(announcer.textContent).toBe('')
  })

  it('does not re-announce on repeated moveends while already shown', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)
    const announcer = mapEl.parentElement.querySelector('[role="status"]')

    ml._emit('moveend')
    announcer.textContent = 'sentinel-not-cleared'
    ml._emit('moveend')

    expect(announcer.textContent).toBe('sentinel-not-cleared')
  })

  it('registers a cleanup for the moveend listener, the click handler, and the fullscreen control listeners', () => {
    const mapEl = makeMapEl()
    const ml = makeMl()
    attachResetButton(makeMapInstance(), ml, BBOX, mapEl, cleanups)

    expect(cleanups).toHaveLength(5)
    cleanups.forEach((off) => off())
    expect(ml.off).toHaveBeenCalledWith('moveend', expect.any(Function))
  })

  describe('fullscreen control', () => {
    afterEach(() => {
      Object.defineProperty(document, 'fullscreenElement', { value: null, writable: true, configurable: true })
    })

    it('registers a control in the top-left slot at every breakpoint', () => {
      const mapEl = makeMapEl()
      const mapInstance = makeMapInstance()
      attachResetButton(mapInstance, makeMl(), BBOX, mapEl, cleanups)

      expect(mapInstance.addControl).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          mobile: { slot: 'top-left' },
          tablet: { slot: 'top-left' },
          desktop: { slot: 'top-left' },
          html: expect.stringContaining(MSG_SHOW_ALL_PARCELS)
        })
      )
    })

    it('registers the control markup hidden by default, with pointer-events:auto overriding the overlay ancestor that disables them', () => {
      const mapEl = makeMapEl()
      const mapInstance = makeMapInstance()
      attachResetButton(mapInstance, makeMl(), BBOX, mapEl, cleanups)

      const [, control] = mapInstance.addControl.mock.calls[0]
      const mount = document.createElement('div')
      mount.innerHTML = control.html
      const controlButton = mount.querySelector('button')

      expect(controlButton.style.display).toBe('none')
      expect(controlButton.style.pointerEvents).toBe('auto')
    })

    it('shows the control markup once native fullscreen activates', () => {
      const mapEl = makeMapEl()
      const mapInstance = makeMapInstance()
      attachResetButton(mapInstance, makeMl(), BBOX, mapEl, cleanups)

      const [, control] = mapInstance.addControl.mock.calls[0]
      const mount = document.createElement('div')
      mount.innerHTML = control.html
      document.body.appendChild(mount)
      const controlButton = mount.querySelector('button')

      Object.defineProperty(document, 'fullscreenElement', { value: mapEl, writable: true, configurable: true })
      document.dispatchEvent(new Event('fullscreenchange'))

      expect(controlButton.style.display).toBe('inline-flex')
    })

    it('hides the control markup again once fullscreen exits', () => {
      const mapEl = makeMapEl()
      const mapInstance = makeMapInstance()
      attachResetButton(mapInstance, makeMl(), BBOX, mapEl, cleanups)

      const [, control] = mapInstance.addControl.mock.calls[0]
      const mount = document.createElement('div')
      mount.innerHTML = control.html
      document.body.appendChild(mount)
      const controlButton = mount.querySelector('button')

      Object.defineProperty(document, 'fullscreenElement', { value: mapEl, writable: true, configurable: true })
      document.dispatchEvent(new Event('fullscreenchange'))
      expect(controlButton.style.display).toBe('inline-flex')

      Object.defineProperty(document, 'fullscreenElement', { value: null, writable: true, configurable: true })
      document.dispatchEvent(new Event('fullscreenchange'))

      expect(controlButton.style.display).toBe('none')
    })

    it('stops responding to fullscreenchange once cleaned up', () => {
      const mapEl = makeMapEl()
      const mapInstance = makeMapInstance()
      attachResetButton(mapInstance, makeMl(), BBOX, mapEl, cleanups)

      const [, control] = mapInstance.addControl.mock.calls[0]
      const mount = document.createElement('div')
      mount.innerHTML = control.html
      document.body.appendChild(mount)
      const controlButton = mount.querySelector('button')

      cleanups.forEach((off) => off())

      Object.defineProperty(document, 'fullscreenElement', { value: mapEl, writable: true, configurable: true })
      document.dispatchEvent(new Event('fullscreenchange'))

      expect(controlButton.style.display).toBe('none')
    })

    it('triggers an animated re-fit when the registered control markup is clicked anywhere in the document', () => {
      const mapEl = makeMapEl()
      const mapInstance = makeMapInstance()
      const ml = makeMl()
      attachResetButton(mapInstance, ml, BBOX, mapEl, cleanups)

      const [, control] = mapInstance.addControl.mock.calls[0]
      // Simulates the library mounting the control's static html elsewhere
      // in the document (inside its own fullscreen app root).
      const mount = document.createElement('div')
      mount.innerHTML = control.html
      document.body.appendChild(mount)

      mount.querySelector('button').click()

      expect(ml.fitBounds).toHaveBeenCalledWith(
        [
          [BBOX.minLng, BBOX.minLat],
          [BBOX.maxLng, BBOX.maxLat]
        ],
        expect.objectContaining({ animate: true })
      )
    })

    it('ignores clicks that are not on the registered control', () => {
      const mapEl = makeMapEl()
      const mapInstance = makeMapInstance()
      const ml = makeMl()
      attachResetButton(mapInstance, ml, BBOX, mapEl, cleanups)

      document.body.click()

      expect(ml.fitBounds).not.toHaveBeenCalled()
    })

    it('stops responding to clicks once cleaned up', () => {
      const mapEl = makeMapEl()
      const mapInstance = makeMapInstance()
      const ml = makeMl()
      attachResetButton(mapInstance, ml, BBOX, mapEl, cleanups)

      const [, control] = mapInstance.addControl.mock.calls[0]
      const mount = document.createElement('div')
      mount.innerHTML = control.html
      document.body.appendChild(mount)

      cleanups.forEach((off) => off())
      mount.querySelector('button').click()

      expect(ml.fitBounds).not.toHaveBeenCalled()
    })
  })
})
