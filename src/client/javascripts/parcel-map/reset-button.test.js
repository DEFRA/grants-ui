// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { attachResetButton } from './reset-button.js'
import {
  MSG_SHOW_ALL_PARCELS,
  MSG_SHOW_ALL_PARCELS_AVAILABLE,
  SHOW_ALL_BUTTON_ID,
  SHOW_ALL_ICON_SVG,
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

let mapInstance

function attachResetButtonToMap(context) {
  const button = { hidden: false, click: () => mapInstance.addButton.mock.calls[0][1].onClick() }
  mapInstance = {
    addButton: vi.fn((id, config) => (button.hidden = config.isHidden)),
    toggleButtonState: vi.fn((id, prop, value) => (button[prop] = value))
  }
  attachResetButton({ mapInstance, ...context })
  return mapInstance.addButton.mock.calls.length ? button : undefined
}

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

describe('attachResetButton', () => {
  let cleanups

  beforeEach(() => {
    document.body.innerHTML = ''
    cleanups = []
  })

  it('returns undefined when the map element has no wrapper parent', () => {
    const orphan = document.createElement('div')
    expect(attachResetButton({ ml: makeMl(), store: { bbox: BBOX }, mapEl: orphan, cleanups })).toBeUndefined()
  })

  it('returns undefined when the map element is null', () => {
    expect(attachResetButton({ ml: makeMl(), store: { bbox: BBOX }, mapEl: null, cleanups })).toBeUndefined()
  })

  it('returns undefined when there is no bbox', () => {
    const mapEl = makeMapEl()
    expect(attachResetButton({ ml: makeMl(), store: { bbox: null }, mapEl, cleanups })).toBeUndefined()
  })

  it('is hidden by default, in the bottom-left slot, and labelled "View all land parcels"', () => {
    const mapEl = makeMapEl()
    const button = attachResetButtonToMap({ ml: makeMl(), store: { bbox: BBOX }, mapEl, cleanups })

    expect(button.hidden).toBe(true)
    expect(mapInstance.addButton).toHaveBeenCalledWith(
      SHOW_ALL_BUTTON_ID,
      expect.objectContaining({ label: MSG_SHOW_ALL_PARCELS, mobile: { slot: 'bottom-left' } })
    )
  })

  it('stays hidden when drift is below the threshold (incidental nudge)', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX - 1 })
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

    ml._emit('moveend')

    expect(button.hidden).toBe(true)
  })

  it('shows the button once drift reaches the threshold', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

    ml._emit('moveend')

    expect(button.hidden).toBe(false)
  })

  it('hides itself immediately and triggers an animated re-fit when clicked', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

    ml._emit('moveend')
    expect(button.hidden).toBe(false)

    button.click()

    expect(button.hidden).toBe(true)
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
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

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
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

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
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

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
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

    ml._emit('idle')
    ml.getZoom.mockReturnValue(INITIAL_ZOOM + 1)
    ml._emit('moveend')

    expect(button.hidden).toBe(false)
  })

  it('ignores a negligible zoom change below the tolerance', () => {
    const mapEl = makeMapEl()
    const ml = makeMl()
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

    ml._emit('idle')
    ml.getZoom.mockReturnValue(INITIAL_ZOOM + 0.01)
    ml._emit('moveend')

    expect(button.hidden).toBe(true)
  })

  it('does not hide once shown, even when zoom returns to its initial-view value', () => {
    const mapEl = makeMapEl()
    const ml = makeMl()
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

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
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

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

    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })
    ml._emit('idle')

    // The map is still exactly at the real fitted center, not the bbox
    // midpoint — the button should stay hidden.
    ml._emit('moveend')

    expect(button.hidden).toBe(true)
  })

  it('announces the button becoming available via a visually-hidden live region', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })
    const announcer = mapEl.parentElement.querySelector('[role="status"]')

    expect(announcer).not.toBeNull()
    expect(announcer.textContent).toBe('')

    ml._emit('moveend')

    expect(announcer.textContent).toBe(MSG_SHOW_ALL_PARCELS_AVAILABLE)
  })

  it('clears the announcement once the button is clicked', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })
    const announcer = mapEl.parentElement.querySelector('[role="status"]')

    ml._emit('moveend')
    expect(announcer.textContent).toBe(MSG_SHOW_ALL_PARCELS_AVAILABLE)

    button.click()

    expect(announcer.textContent).toBe('')
  })

  it('does not re-announce on repeated moveends while already shown', () => {
    const mapEl = makeMapEl()
    const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
    attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })
    const announcer = mapEl.parentElement.querySelector('[role="status"]')

    ml._emit('moveend')
    announcer.textContent = 'sentinel-not-cleared'
    ml._emit('moveend')

    expect(announcer.textContent).toBe('sentinel-not-cleared')
  })

  it('registers a cleanup for the idle and moveend listeners', () => {
    const mapEl = makeMapEl()
    const ml = makeMl()
    attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

    expect(cleanups).toHaveLength(2)
    cleanups.forEach((off) => off())
    expect(ml.off).toHaveBeenCalledWith('idle', expect.any(Function))
    expect(ml.off).toHaveBeenCalledWith('moveend', expect.any(Function))
  })

  describe('vendor button', () => {
    const attachMoved = () => {
      const mapEl = makeMapEl()
      const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX })
      const button = attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })
      const announcer = mapEl.parentElement.querySelector('[role="status"]')
      return { ml, button, announcer }
    }

    it('registers the button once with its id, label, icon and click handler', () => {
      attachMoved()

      expect(mapInstance.addButton).toHaveBeenCalledExactlyOnceWith(SHOW_ALL_BUTTON_ID, {
        label: MSG_SHOW_ALL_PARCELS,
        iconSvgContent: SHOW_ALL_ICON_SVG,
        isHidden: true,
        onClick: expect.any(Function),
        mobile: { slot: 'bottom-left' },
        tablet: { slot: 'bottom-left' },
        desktop: { slot: 'bottom-left' }
      })
    })

    it.each([
      ['the map element has no wrapper parent', () => ({ mapEl: document.createElement('div'), bbox: BBOX })],
      ['there is no bbox', () => ({ mapEl: makeMapEl(), bbox: null })]
    ])('adds neither a button nor a live region when %s', (_, setup) => {
      const { mapEl, bbox } = setup()
      attachResetButtonToMap({ ml: makeMl(), store: { bbox }, mapEl, cleanups })

      expect(mapInstance.addButton).not.toHaveBeenCalled()
      expect(document.querySelector('[role="status"]')).toBeNull()
      expect(cleanups).toHaveLength(0)
    })

    it('leaves the button state alone until the map has moved past the threshold', () => {
      const mapEl = makeMapEl()
      const ml = makeMl({ offsetPx: SHOW_ALL_MOVE_THRESHOLD_PX - 1 })
      attachResetButtonToMap({ ml, store: { bbox: BBOX }, mapEl, cleanups })

      ml._emit('idle')
      ml._emit('moveend')

      expect(mapInstance.toggleButtonState).not.toHaveBeenCalled()
    })

    it('unhides the button through the vendor API only once while it stays shown', () => {
      const { ml } = attachMoved()

      ml._emit('moveend')
      ml._emit('moveend')

      expect(mapInstance.toggleButtonState).toHaveBeenCalledExactlyOnceWith(SHOW_ALL_BUTTON_ID, 'hidden', false)
    })

    it('hides the button through the vendor API when clicked', () => {
      const { ml, button } = attachMoved()

      ml._emit('moveend')
      button.click()

      expect(mapInstance.toggleButtonState).toHaveBeenLastCalledWith(SHOW_ALL_BUTTON_ID, 'hidden', true)
    })

    it('accepts the event and context arguments the vendor passes to onClick', () => {
      const { ml } = attachMoved()
      const { onClick } = mapInstance.addButton.mock.calls[0][1]

      ml._emit('moveend')
      onClick(new Event('click'), { appState: {} })

      expect(ml.fitBounds).toHaveBeenCalledOnce()
      expect(mapInstance.toggleButtonState).toHaveBeenLastCalledWith(SHOW_ALL_BUTTON_ID, 'hidden', true)
    })

    it('shows and announces the button again after a reset followed by a fresh move', () => {
      const { ml, button, announcer } = attachMoved()

      ml._emit('moveend')
      button.click()
      // The reset animation's own moveend is ignored.
      ml._emit('moveend')
      expect(button.hidden).toBe(true)
      expect(announcer.textContent).toBe('')

      ml._emit('moveend')

      expect(button.hidden).toBe(false)
      expect(announcer.textContent).toBe(MSG_SHOW_ALL_PARCELS_AVAILABLE)
      expect(mapInstance.toggleButtonState.mock.calls.map(([, , value]) => value)).toEqual([false, true, false])
    })
  })
})
