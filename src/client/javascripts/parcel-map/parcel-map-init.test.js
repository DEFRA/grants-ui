// @ts-nocheck
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@defra/interactive-map', () => ({
  default: vi.fn().mockImplementation(function () {
    this.on = vi.fn()
    this.destroy = vi.fn()
  })
}))
vi.mock('@defra/interactive-map/providers/maplibre', () => ({
  default: vi.fn(() => ({
    load: async () => ({
      MapProvider: class {
        getFeaturesAtPoint() {
          return []
        }
      }
    })
  }))
}))
vi.mock('@defra/interactive-map/plugins/interact', () => ({
  default: vi.fn(() => ({ enable: vi.fn(), disable: vi.fn(), clear: vi.fn() }))
}))

import InteractiveMap from '@defra/interactive-map'
import { initMap } from './parcel-map-init.js'
import { FULLSCREEN_BUTTON_MAX_WIDTH_PX } from './config.js'

const MARKER = 'data-parcel-map-fullscreen-visibility'

function makeHost() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host
}

describe('initMap', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.querySelectorAll(`style[${MARKER}]`).forEach((el) => el.remove())
    InteractiveMap.mockClear()
  })

  it('enables the library-native fullscreen toggle', () => {
    const host = makeHost()
    initMap(host, { multiSelect: false, skeleton: null, isLoading: () => true, cleanups: [] })

    const [, options] = InteractiveMap.mock.calls.at(-1)
    expect(options.enableFullscreen).toBe(true)
  })

  it('injects a stylesheet hiding the fullscreen button above the mobile breakpoint', () => {
    const host = makeHost()
    initMap(host, { multiSelect: false, skeleton: null, isLoading: () => true, cleanups: [] })

    const style = document.head.querySelector(`style[${MARKER}]`)
    expect(style).not.toBeNull()
    expect(style.textContent).toContain('.im-c-button-wrapper--fullscreen')
    expect(style.textContent).toContain('display: none')
    expect(style.textContent).toContain(`${FULLSCREEN_BUTTON_MAX_WIDTH_PX + 1}px`)
  })

  it('injects the fullscreen visibility stylesheet only once across multiple maps', () => {
    initMap(makeHost(), { multiSelect: false, skeleton: null, isLoading: () => true, cleanups: [] })
    initMap(makeHost(), { multiSelect: false, skeleton: null, isLoading: () => true, cleanups: [] })

    expect(document.head.querySelectorAll(`style[${MARKER}]`)).toHaveLength(1)
  })

  it('builds a positioned wrapper containing the map element', () => {
    const host = makeHost()
    const { mapEl } = initMap(host, { multiSelect: false, skeleton: null, isLoading: () => true, cleanups: [] })

    const wrapper = mapEl.parentElement
    expect(wrapper.style.position).toBe('relative')
    expect(host.contains(wrapper)).toBe(true)
  })

  it('inserts the wrapper before the skeleton when one is given, instead of appending to host', () => {
    const host = makeHost()
    const skeleton = document.createElement('div')
    skeleton.id = 'skeleton'
    host.appendChild(skeleton)

    const { mapEl } = initMap(host, { multiSelect: false, skeleton, isLoading: () => true, cleanups: [] })

    const wrapper = mapEl.parentElement
    expect(wrapper.nextElementSibling).toBe(skeleton)
  })

  it("passes minZoom, mapLabel, and url sync 'none' through to InteractiveMap", () => {
    const host = makeHost()
    initMap(host, { multiSelect: false, skeleton: null, isLoading: () => true, cleanups: [] })

    const [, options] = InteractiveMap.mock.calls.at(-1)
    expect(options.urlPosition).toBe('none')
    expect(options.mapLabel).toEqual(expect.stringContaining('land parcels'))
    expect(typeof options.minZoom).toBe('number')
  })
})
