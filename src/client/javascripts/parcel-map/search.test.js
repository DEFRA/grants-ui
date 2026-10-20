// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@defra/interactive-map/plugins/search', () => ({
  default: vi.fn((options) => ({ id: 'search', ...options }))
}))

import createSearchPlugin from '@defra/interactive-map/plugins/search'
import {
  animateToBounds,
  attachParcelSearch,
  createParcelSearchDataset,
  createParcelSearchPlugin,
  markMatch
} from './search.js'
import { makeMlMap } from './test-helpers.js'
import { MSG_SEARCH_ERROR, SEARCH_FIT_MAX_ZOOM, SELECTION_SOURCE_SEARCH } from './config.js'

const BOUNDS = { minLng: -2.5, minLat: 51.4, maxLng: -2.4, maxLat: 51.5 }

function makeMl() {
  return makeMlMap({
    getCenter: vi.fn().mockReturnValue({ lng: -1, lat: 52 }),
    getBounds: vi.fn().mockReturnValue({
      toArray: () => [
        [-1.5, 51.5],
        [-0.5, 52.5]
      ]
    }),
    // Reports the map as already at whatever it is asked to frame.
    cameraForBounds: vi.fn().mockReturnValue({ center: [-1, 52], zoom: 10 }),
    project: vi.fn().mockReturnValue({ x: 0, y: 0 })
  })
}

function makeMapInstance() {
  const handlers = {}
  return {
    on: vi.fn((event, handler) => {
      handlers[event] = handler
    }),
    off: vi.fn((event) => {
      delete handlers[event]
    }),
    _emit: (event, payload) => handlers[event]?.(payload)
  }
}

function makeHost() {
  const wrapper = document.createElement('div')
  const mapEl = document.createElement('div')
  wrapper.appendChild(mapEl)
  const host = document.createElement('div')
  host.appendChild(wrapper)
  document.body.appendChild(host)
  host.selectParcels = vi.fn()
  return { host, mapEl }
}

const fetchJson = (body, ok = true) => vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('markMatch', () => {
  it('wraps the matched characters in <mark>, across the space in the display form', () => {
    expect(markMatch('SD7148 9160', '48 91')).toBe('SD71<mark>48 91</mark>60')
    expect(markMatch('SD7148 9160', 'sd71')).toBe('<mark>SD71</mark>48 9160')
  })

  it('escapes the text and marks nothing when the query does not match', () => {
    expect(markMatch('SD7148 9160', 'ZZ')).toBe('SD7148 9160')
    expect(markMatch('<b>', '')).toBe('&lt;b&gt;')
  })

  it('treats regex metacharacters in the query as plain text', () => {
    expect(markMatch('SD7148 9160', '.*')).toBe('SD7148 9160')
  })
})

describe('createParcelSearchDataset', () => {
  it('only queries once the input holds a letter or digit, so stripped-out junk never reaches the route', () => {
    const { includeRegex } = createParcelSearchDataset()

    expect(includeRegex.test('SD6')).toBe(true)
    expect(includeRegex.test('43 5')).toBe(true)
    expect(includeRegex.test("''''''")).toBe(false)
    expect(includeRegex.test('...')).toBe(false)
  })

  it('reads ids from the search route and hands the plugin no extent, leaving the framing to attachParcelSearch', () => {
    const dataset = createParcelSearchDataset()

    expect(dataset.urlTemplate).toBe('/api/map/parcels/search?q={query}')
    expect(dataset.parseResults({ parcelIds: ['SD7148-9160'] }, '7148')).toEqual([
      {
        id: 'SD7148-9160',
        type: 'parcels',
        text: 'SD7148 9160',
        marked: 'SD<mark>7148</mark> 9160',
        bounds: null,
        point: null
      }
    ])
  })

  it('ignores a malformed response', () => {
    const dataset = createParcelSearchDataset()

    expect(dataset.parseResults({}, 'SD')).toEqual([])
    expect(dataset.parseResults({ parcelIds: [1, null] }, 'SD')).toEqual([])
  })
})

describe('createParcelSearchPlugin', () => {
  it('configures the vendor plugin with the parcel dataset and the GOV.UK copy, without a marker', () => {
    createParcelSearchPlugin()

    expect(createSearchPlugin).toHaveBeenCalledWith({
      customDatasets: [expect.objectContaining({ name: 'parcels' })],
      showMarker: false,
      placeholder: 'Search by parcel ID',
      noResultsMessage: 'No matching land parcels',
      searchErrorMessage: 'Search is unavailable'
    })
  })
})

describe('animateToBounds', () => {
  it('fits with animation under the search zoom cap and stops listening once the map is at the target', () => {
    const ml = makeMl()

    const stop = animateToBounds(ml, BOUNDS)
    ml._emit('moveend')

    expect(ml.fitBounds).toHaveBeenCalledTimes(1)
    expect(ml.fitBounds).toHaveBeenCalledWith(
      [
        [-2.5, 51.4],
        [-2.4, 51.5]
      ],
      expect.objectContaining({ animate: true, maxZoom: SEARCH_FIT_MAX_ZOOM })
    )
    expect(ml.off).toHaveBeenCalledWith('moveend', expect.any(Function))
    stop()
  })

  it('fits once more when a move ends short of the target, then gives up', () => {
    const ml = makeMl()
    ml.getZoom.mockReturnValue(7)

    animateToBounds(ml, BOUNDS)
    ml._emit('moveend')
    expect(ml.fitBounds).toHaveBeenCalledTimes(2)

    ml._emit('moveend')
    expect(ml.fitBounds).toHaveBeenCalledTimes(2)
    expect(ml.off).toHaveBeenCalledWith('moveend', expect.any(Function))
  })

  it('treats a frame the map cannot compute as reached', () => {
    const ml = makeMl()
    ml.cameraForBounds.mockReturnValue(undefined)
    ml.getZoom.mockReturnValue(7)

    animateToBounds(ml, BOUNDS)
    ml._emit('moveend')

    expect(ml.fitBounds).toHaveBeenCalledTimes(1)
  })
})

describe('attachParcelSearch', () => {
  let ml
  let mapInstance
  let cleanups

  beforeEach(() => {
    document.body.innerHTML = ''
    ml = makeMl()
    mapInstance = makeMapInstance()
    cleanups = []
    globalThis.scrollTo = vi.fn()
    globalThis.fetch = fetchJson({ bbox: BOUNDS })
  })

  function attach() {
    const { host, mapEl } = makeHost()
    attachParcelSearch({ host, mapInstance, ml, mapEl, cleanups })
    return { host, status: mapEl.parentElement.querySelector('[role="status"]') }
  }

  const FITTED = [
    [-2.5, 51.4],
    [-2.4, 51.5]
  ]

  it('selects the matched parcel as a search selection, looks its extent up and animates to it', async () => {
    const { host } = attach()

    mapInstance._emit('search:match', { id: 'SD7148-9160' })
    await flush()

    expect(host.selectParcels).toHaveBeenCalledWith(['SD7148-9160'], { source: SELECTION_SOURCE_SEARCH })
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/map/parcels/SD7148-9160/bbox')
    expect(ml.fitBounds).toHaveBeenCalledWith(
      FITTED,
      expect.objectContaining({ animate: true, maxZoom: SEARCH_FIT_MAX_ZOOM })
    )
  })

  it('looks an extent up once and reuses it for a repeat pick', async () => {
    attach()

    mapInstance._emit('search:match', { id: 'SD7148-9160' })
    await flush()
    mapInstance._emit('search:match', { id: 'SD7148-9160' })
    await flush()

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(ml.fitBounds).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['the route fails', () => fetchJson({}, false)],
    ['the network fails', () => vi.fn().mockRejectedValue(new Error('offline'))]
  ])('selects nothing and reports search as unavailable when %s', async (_name, makeFetch) => {
    globalThis.fetch = makeFetch()
    const { host, status } = attach()

    mapInstance._emit('search:match', { id: 'SD7148-9160' })
    await flush()

    expect(host.selectParcels).not.toHaveBeenCalled()
    expect(ml.fitBounds).not.toHaveBeenCalled()
    expect(status.textContent).toBe(MSG_SEARCH_ERROR)

    // The next pick clears it.
    mapInstance._emit('search:match', { id: 'SD7148-9161' })
    expect(status.textContent).toBe('')
  })

  it('does not select until the extent has been looked up', async () => {
    let resolveFetch
    globalThis.fetch = vi.fn().mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)))
    const { host } = attach()

    mapInstance._emit('search:match', { id: 'SD7148-9160' })
    expect(host.selectParcels).not.toHaveBeenCalled()

    resolveFetch({ ok: true, json: () => Promise.resolve({ bbox: BOUNDS }) })
    await flush()
    expect(host.selectParcels).toHaveBeenCalledWith(['SD7148-9160'], { source: SELECTION_SOURCE_SEARCH })
  })

  it('puts the page back where the user last scrolled it before the pick', () => {
    Object.assign(globalThis, { scrollX: 0, scrollY: 0 })
    attach()
    Object.assign(globalThis, { scrollY: 100 })
    globalThis.dispatchEvent(new Event('scroll'))

    // The vendor plugin focuses the viewport, scrolling the page, before it
    // emits; that scroll event has not fired yet when the match arrives.
    Object.assign(globalThis, { scrollY: 340 })
    mapInstance._emit('search:match', { id: 'SD7148-9160' })

    expect(globalThis.scrollTo).toHaveBeenCalledWith(0, 100)
  })

  it('does not scroll when the page did not move', () => {
    Object.assign(globalThis, { scrollX: 0, scrollY: 100 })
    attach()

    mapInstance._emit('search:match', { id: 'SD7148-9160' })

    expect(globalThis.scrollTo).not.toHaveBeenCalled()
  })

  it('stops tracking the scroll position on teardown', () => {
    Object.assign(globalThis, { scrollX: 0, scrollY: 0 })
    attach()
    cleanups.forEach((off) => off())

    Object.assign(globalThis, { scrollY: 100 })
    globalThis.dispatchEvent(new Event('scroll'))
    Object.assign(globalThis, { scrollY: 340 })
    mapInstance._emit('search:match', { id: 'SD7148-9160' })

    expect(globalThis.scrollTo).not.toHaveBeenCalled()
  })

  it('keeps the input focused on a mousedown inside the suggestions list, so the plugin does not close it', () => {
    const { host } = attach()
    const list = document.createElement('ul')
    list.className = 'im-c-search-suggestions'
    const item = document.createElement('li')
    list.appendChild(item)
    host.appendChild(list)

    const onItem = new globalThis.MouseEvent('mousedown', { bubbles: true, cancelable: true })
    item.dispatchEvent(onItem)
    expect(onItem.defaultPrevented).toBe(true)

    const elsewhere = new globalThis.MouseEvent('mousedown', { bubbles: true, cancelable: true })
    host.dispatchEvent(elsewhere)
    expect(elsewhere.defaultPrevented).toBe(false)

    cleanups.forEach((off) => off())
    const afterTeardown = new globalThis.MouseEvent('mousedown', { bubbles: true, cancelable: true })
    item.dispatchEvent(afterTeardown)
    expect(afterTeardown.defaultPrevented).toBe(false)
  })

  it('ignores a lookup that lands after teardown', async () => {
    let resolveFetch
    globalThis.fetch = vi.fn().mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)))
    attach()

    mapInstance._emit('search:match', { id: 'SD7148-9160' })
    cleanups.forEach((off) => off())
    resolveFetch({ ok: true, json: () => Promise.resolve({ bbox: BOUNDS }) })
    await flush()

    expect(ml.fitBounds).not.toHaveBeenCalled()
    expect(mapInstance.off).toHaveBeenCalledWith('search:match', expect.any(Function))
  })
})
