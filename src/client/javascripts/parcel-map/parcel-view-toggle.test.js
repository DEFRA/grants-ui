// @vitest-environment jsdom
// @ts-nocheck
import { initParcelSelectPage } from './parcel-select-page.js'
import { PARCEL_VIEW_STORAGE_KEY, PARCEL_SELECTION_STORAGE_KEY } from './parcel-view-toggle.js'
import {
  EVENT_READY,
  EVENT_ERROR,
  EVENT_SELECTION,
  ERROR_REASON_UNAVAILABLE,
  PARCEL_DETAILS_LOADING_DELAY_MS,
  PARCEL_DETAILS_LOADING_MIN_DURATION_MS
} from './config.js'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const PARCEL_A = 'SO3757-3184'
const PARCEL_B = 'SO3757-3185'
const renderPage = createPageRenderer(
  import.meta.url,
  'map-select-parcel.html',
  {
    pageTitle: 'Select a land parcel',
    formAction: '/select-land-parcel',
    enabledLandActions: ['CLIG3'],
    parcels: [PARCEL_A, PARCEL_B].map((id) => ({
      id,
      reference: id.replace('-', ' '),
      area: '12.3456 ha',
      areaHa: 12.3456
    })),
    totalArea: '24.6912'
  },
  ['src/server/common/map/views']
)

function setup(overrides = {}, { lastEvent } = {}) {
  const $ = renderPage(overrides)
  document.body.innerHTML = $('body').html()
  document.getElementById('selected-parcel-details').scrollIntoView = vi.fn()
  const map = document.getElementById('parcel-map')
  let ready = false
  let mapIds = []
  const emit = (ids) =>
    map.dispatchEvent(
      new CustomEvent(EVENT_SELECTION, {
        detail: { selectedParcels: ids.map((id) => ({ id })) }
      })
    )
  map.selectParcels = vi.fn((ids) => {
    if (ready) {
      mapIds = ids
      emit(ids)
    }
  })
  map.clearSelection = vi.fn(() => {
    if (ready) {
      mapIds = []
      emit([])
    }
  })
  map.resize = vi.fn()
  map.focusParcels = vi.fn()
  if (lastEvent) {
    map.getLastEvent = (type) => (lastEvent.type === type ? lastEvent : null)
  }
  initParcelSelectPage(map)
  return {
    map,
    ready: (metaIndex = { [PARCEL_A]: { areaHa: 12.3456 } }) => {
      ready = true
      map.dispatchEvent(
        new CustomEvent(EVENT_READY, {
          detail: { parcelIds: [PARCEL_A, PARCEL_B], metaIndex }
        })
      )
    },
    selectOnMap: (ids) => {
      mapIds = ids
      emit(ids)
    },
    mapIds: () => mapIds
  }
}

// JSDOM cannot navigate. Allow the production handler to run, capture whether
// it permits a real navigation, then simulate the destination's fresh document.
const clickToggle = () => {
  const link = document.getElementById('parcel-view-toggle')
  let navigates = false
  link.addEventListener(
    'click',
    (event) => {
      navigates = !event.defaultPrevented
      event.preventDefault()
    },
    { once: true }
  )
  link.click()
  return navigates
}
const toggle = (overrides) => (clickToggle() ? setup(overrides) : undefined)
const list = () => document.getElementById('land-parcels')
const radio = (id) => list().querySelector(`input[value="${id}"]`)
const submittedIds = () => new FormData(document.getElementById('parcel-select-form')).getAll('landParcels')
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const noticeResponse = (items = ['site of special scientific interest (SSSI) consent'], actionCount = 2) => ({
  ok: true,
  json: async () => ({ intro: items.length ? 'Some actions require:' : '', items, actionCount })
})

describe('parcel map and list views', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    window.localStorage.clear()
    window.sessionStorage.clear()
    global.fetch = vi.fn().mockResolvedValue(noticeResponse())
  })
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('defaults to the map and uses a real GET navigation to the standard-width list', () => {
    setup()
    const link = document.getElementById('parcel-view-toggle')
    expect(list().hidden).toBe(true)
    expect(document.body.classList.contains('map-select-parcel--map')).toBe(true)
    expect(link.textContent).toBe('View parcels as a list')
    expect(link.getAttribute('href')).toBe(window.location.pathname + window.location.search)
    link.focus()
    expect(clickToggle()).toBe(true)
    // Nothing is switched or initialised in the old document before navigation.
    expect(list().hidden).toBe(true)
    expect(window.localStorage.getItem(PARCEL_VIEW_STORAGE_KEY)).toBe('list')
    setup()
    expect(list().hidden).toBe(false)
    expect(document.body.classList.contains('map-select-parcel--map')).toBe(false)
    expect(document.getElementById('parcel-map-view').hidden).toBe(true)
    expect(document.getElementById('parcel-view-toggle').textContent).toBe('View parcels on a map')
    expect(document.activeElement).not.toBe(link)
    expect(window.localStorage.getItem(PARCEL_VIEW_STORAGE_KEY)).toBe('list')
  })

  it.each(['map', 'list'])('mentions both options in the hint when JavaScript enhances the %s view', (view) => {
    window.localStorage.setItem(PARCEL_VIEW_STORAGE_KEY, view)
    setup()
    expect(document.getElementById('parcel-selection-map-hint').hidden).toBe(false)
    expect(document.getElementById('parcel-selection-hint').textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Select a parcel from the map or the list of your parcels.'
    )
  })

  it('restores the preference on future visits and saves switching back to the map', () => {
    setup()
    toggle()
    setup()
    expect(list().hidden).toBe(false)
    toggle()
    expect(window.localStorage.getItem(PARCEL_VIEW_STORAGE_KEY)).toBe('map')
    setup()
    expect(list().hidden).toBe(true)
  })

  it('saves the map preference and selection before navigation without activating the old map', () => {
    window.localStorage.setItem(PARCEL_VIEW_STORAGE_KEY, 'list')
    const page = setup()
    radio(PARCEL_A).click()
    expect(clickToggle()).toBe(true)
    expect(window.localStorage.getItem(PARCEL_VIEW_STORAGE_KEY)).toBe('map')
    expect(JSON.parse(window.sessionStorage.getItem(PARCEL_SELECTION_STORAGE_KEY)).ids).toEqual([PARCEL_A])
    expect(page.map.resize).not.toHaveBeenCalled()
    expect(page.map.hasAttribute('defer-loading')).toBe(true)
  })

  it('consumes the temporary selection once without leaving it selected on unrelated later visits', () => {
    setup()
    toggle()
    radio(PARCEL_B).click()
    toggle()
    expect(submittedIds()).toEqual([PARCEL_B])
    expect(window.sessionStorage.getItem(PARCEL_SELECTION_STORAGE_KEY)).toBeNull()
    setup()
    expect(submittedIds()).toEqual([])
  })

  it('uses the current journey URL, retains its query and drops any fragment for the document navigation', () => {
    const path = '/another-grant/select-parcel?origin=confirm-land-and-actions'
    window.history.replaceState(null, '', `${path}#land-parcels`)
    setup()
    const link = document.getElementById('parcel-view-toggle')
    expect(link.getAttribute('href')).toBe(path)
    expect(clickToggle()).toBe(true)
    expect(JSON.parse(window.sessionStorage.getItem(PARCEL_SELECTION_STORAGE_KEY)).path).toBe(path)
  })

  it.each([
    ['malformed JSON', 'invalid'],
    ['a different journey', JSON.stringify({ path: '/other-grant/select-parcel', ids: [PARCEL_B] })],
    ['invalid selection data', JSON.stringify({ path: '/', ids: PARCEL_B })],
    ['null data', 'null']
  ])('ignores %s without replacing a server-rendered selection', (_, saved) => {
    window.sessionStorage.setItem(PARCEL_SELECTION_STORAGE_KEY, saved)
    setup({ selectedParcelIds: [PARCEL_A] })
    expect(submittedIds()).toEqual([PARCEL_A])
    expect(window.sessionStorage.getItem(PARCEL_SELECTION_STORAGE_KEY)).toBeNull()
  })

  it('restores only available parcels, ignoring unknown or invalid stored IDs', () => {
    window.sessionStorage.setItem(
      PARCEL_SELECTION_STORAGE_KEY,
      JSON.stringify({ path: '/', ids: ['UNKNOWN-0000', null, 123, PARCEL_B] })
    )
    setup()
    expect(submittedIds()).toEqual([PARCEL_B])
  })

  it('carries an empty selection rather than restoring a previous server selection', () => {
    window.sessionStorage.setItem(PARCEL_SELECTION_STORAGE_KEY, JSON.stringify({ path: '/', ids: [] }))
    setup({ selectedParcelIds: [PARCEL_A] })
    expect(submittedIds()).toEqual([])
    expect(radio(PARCEL_A).checked).toBe(false)
  })

  it.each(['/select-land-parcel', '/another-grant/select-parcel', '/select-land-parcel?from=task-list'])(
    'restores map preference with a selection when returning through %s',
    (formAction) => {
      window.localStorage.setItem(PARCEL_VIEW_STORAGE_KEY, 'list')
      setup()
      radio(PARCEL_A).click()
      toggle()
      document.body.innerHTML = '<h1>Task list</h1>'
      const page = setup({ formAction, selectedParcelIds: [PARCEL_A] })
      expect(list().hidden).toBe(true)
      expect(document.getElementById('parcel-map-view').hidden).toBe(false)
      expect(window.localStorage.getItem(PARCEL_VIEW_STORAGE_KEY)).toBe('map')
      page.ready()
      expect(page.mapIds()).toEqual([PARCEL_A])
    }
  )

  it('retains the selection in both directions and submits exactly one value', () => {
    let page = setup()
    page.ready()
    page.selectOnMap([PARCEL_A])
    expect(submittedIds()).toEqual([PARCEL_A])
    toggle()
    expect(radio(PARCEL_A).checked).toBe(true)
    expect(submittedIds()).toEqual([PARCEL_A])
    radio(PARCEL_B).click()
    expect(submittedIds()).toEqual([PARCEL_B])
    page = toggle()
    page.ready()
    expect(page.mapIds()).toEqual([PARCEL_B])
    expect(submittedIds()).toEqual([PARCEL_B])
    toggle()
    expect(radio(PARCEL_B).checked).toBe(true)
  })

  it('keeps a selection made in the list before the map is ready', () => {
    window.localStorage.setItem(PARCEL_VIEW_STORAGE_KEY, 'list')
    setup({ selectedParcelIds: [PARCEL_A] })
    radio(PARCEL_B).click()
    const page = toggle()
    page.ready()
    expect(page.mapIds()).toEqual([PARCEL_B])
    expect(submittedIds()).toEqual([PARCEL_B])
  })

  it('ignores late map selection events while the user is in the list', () => {
    const page = setup()
    page.ready()
    toggle()
    radio(PARCEL_B).click()
    page.selectOnMap([PARCEL_A])
    expect(submittedIds()).toEqual([PARCEL_B])
    const returnedPage = toggle()
    returnedPage.ready()
    expect(returnedPage.mapIds()).toEqual([PARCEL_B])
  })

  it('shows only selected parcel details and announces the information without moving focus', async () => {
    setup()
    toggle()
    expect([...list().querySelectorAll('[data-parcel-details]')].every((panel) => panel.hidden)).toBe(true)
    radio(PARCEL_A).focus()
    radio(PARCEL_A).click()
    await flush()
    expect(list().querySelector(`[data-parcel-details="${PARCEL_A}"]`).hidden).toBe(false)
    expect(list().querySelector(`[data-parcel-details="${PARCEL_B}"]`).hidden).toBe(true)
    expect(document.activeElement).toBe(radio(PARCEL_A))
    expect(document.getElementById('parcel-list-status').textContent).toContain('SSSI')
  })

  it('does not fetch extra details on entry or while switching views without a selection', () => {
    const page = setup()
    page.ready()
    toggle()
    toggle()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('keeps the map deferred when the saved preference is the list', () => {
    window.localStorage.setItem(PARCEL_VIEW_STORAGE_KEY, 'list')
    const page = setup()
    expect(page.map.hasAttribute('defer-loading')).toBe(true)
    expect(global.fetch).not.toHaveBeenCalled()
    const returnedPage = toggle()
    expect(page.map.hasAttribute('defer-loading')).toBe(true)
    expect(returnedPage.map.hasAttribute('defer-loading')).toBe(false)
  })

  it('keeps bulk counts for the map but fetches a radio selection independently', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ intro: '', items: [] }) })
    const page = setup()
    page.ready({ [PARCEL_A]: { actionCount: 7 }, [PARCEL_B]: { actionCount: 9 } })
    page.selectOnMap([PARCEL_A])
    await flush()
    expect(global.fetch.mock.calls[0][0]).toBe(`/api/land-grants/actions/${PARCEL_A}/consents`)
    expect(document.getElementById('selected-parcel-actions').textContent).toBe('7')

    toggle()
    await flush()
    radio(PARCEL_B).click()
    await flush()
    expect(global.fetch.mock.calls.at(-1)[0]).toBe(
      `/api/land-grants/actions/${PARCEL_B}/consents?enabledLandActions=CLIG3`
    )
    const panel = list().querySelector(`[data-parcel-details="${PARCEL_B}"]`)
    expect(panel.querySelector('[data-parcel-action-count]').textContent).toBe('2')

    const returnedPage = toggle()
    returnedPage.ready({ [PARCEL_A]: { actionCount: 7 }, [PARCEL_B]: { actionCount: 9 } })
    await flush()
    expect(document.getElementById('selected-parcel-actions').textContent).toBe('9')
    expect(global.fetch).toHaveBeenCalledTimes(4)
  })

  it('fetches only the selected parcel on each reloaded view', async () => {
    const page = setup()
    page.ready()
    toggle()
    radio(PARCEL_A).click()
    await flush()
    expect(global.fetch).toHaveBeenCalledExactlyOnceWith(
      `/api/land-grants/actions/${PARCEL_A}/consents?enabledLandActions=CLIG3`,
      expect.objectContaining({ method: 'POST' })
    )
    const panel = list().querySelector(`[data-parcel-details="${PARCEL_A}"]`)
    expect(panel.querySelector('[data-parcel-action-count]').textContent).toBe('2')
    expect(panel.querySelector('[data-parcel-requirements-row]').hidden).toBe(false)
    toggle()
    await flush()
    toggle()
    await flush()
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(global.fetch.mock.calls.every(([url]) => url.includes(PARCEL_A))).toBe(true)
  })

  it('delays radio loading feedback and holds it for the minimum duration without delaying the API request', async () => {
    vi.useFakeTimers()
    let resolveRequest
    global.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        })
    )
    setup()
    toggle()
    radio(PARCEL_A).click()
    const panel = list().querySelector(`[data-parcel-details="${PARCEL_A}"]`)
    const status = panel.querySelector('[data-parcel-details-status]')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(status.hidden).toBe(true)
    await vi.advanceTimersByTimeAsync(PARCEL_DETAILS_LOADING_DELAY_MS)
    expect(status.hidden).toBe(false)
    resolveRequest(noticeResponse())
    await vi.advanceTimersByTimeAsync(PARCEL_DETAILS_LOADING_MIN_DURATION_MS - 1)
    expect(status.hidden).toBe(false)
    expect(panel.querySelector('[data-parcel-actions-row]').hidden).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(status.hidden).toBe(true)
    expect(panel.querySelector('[data-parcel-action-count]').textContent).toBe('2')
  })

  it('restores the map selection in the list and never loads unselected parcels', async () => {
    const page = setup()
    page.ready()
    page.selectOnMap([PARCEL_A])
    await flush()
    toggle()
    await flush()
    const panel = list().querySelector(`[data-parcel-details="${PARCEL_A}"]`)
    expect(panel.querySelector('[data-parcel-action-count]').textContent).toBe('2')
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[0][0]).toContain(PARCEL_A)
  })

  it('aborts the lookup for each radio the user moves past and fetches the latest straight away', async () => {
    const page = setup()
    page.ready()
    toggle()
    radio(PARCEL_A).click()
    radio(PARCEL_B).click()
    radio(PARCEL_A).click()
    expect(global.fetch.mock.calls.map(([url]) => url.includes(PARCEL_A))).toEqual([true, false, true])
    expect(global.fetch.mock.calls.map(([, { signal }]) => signal.aborted)).toEqual([true, true, false])
    await flush()
    expect(submittedIds()).toEqual([PARCEL_A])
    expect(document.getElementById('parcel-list-status').textContent).toContain('SSSI')
  })

  it('never announces a superseded lookup that still responds', async () => {
    let resolveFirst
    global.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )
    const page = setup()
    page.ready()
    toggle()
    radio(PARCEL_A).click()
    radio(PARCEL_B).click()
    await flush()
    resolveFirst(noticeResponse(['SSSI'], 0))
    await flush()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[1][0]).toContain(PARCEL_B)
    expect(document.getElementById('parcel-list-status').textContent).not.toContain('no actions available')
  })

  it.each([
    [0, 'There are no actions available for this land parcel. Select another land parcel to continue.'],
    [1, '1 available action.'],
    [3, '3 available actions.']
  ])('announces %i actions with the same wording as the page', async (actionCount, expected) => {
    global.fetch.mockResolvedValue(noticeResponse([], actionCount))
    setup()
    toggle()
    radio(PARCEL_A).click()
    await flush()
    expect(document.getElementById('parcel-list-status').textContent).toBe(expected)
  })

  it('keeps Continue available when details fail and retries when the parcel is selected again', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false })
    setup()
    toggle()
    radio(PARCEL_A).click()
    await flush()
    expect(document.getElementById('map-select-continue').disabled).toBe(false)
    expect(list().querySelector('[data-parcel-details-status]').textContent).toContain('Continue to check them')
    radio(PARCEL_B).click()
    await flush()
    radio(PARCEL_A).click()
    await flush()
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(list().querySelector('[data-parcel-action-count]').textContent).toBe('2')
  })

  it('preserves a rejected selection and targets validation links at the active view', () => {
    setup({ selectedParcelIds: [PARCEL_B], errors: [{ text: 'Select another parcel', href: '#land-parcels' }] })
    expect(document.querySelector('.govuk-error-summary a').getAttribute('href')).toBe('#parcel-map')
    toggle()
    expect(radio(PARCEL_B).checked).toBe(true)
    // The toggle GET clears the previous POST validation error.
    expect(document.querySelector('.govuk-error-summary')).toBeNull()
    expect(submittedIds()).toEqual([PARCEL_B])
  })

  it('falls back to the list when the map fails, leaving Continue usable and the preference intact', () => {
    const page = setup()
    page.map.dispatchEvent(new CustomEvent(EVENT_ERROR, { detail: { reason: ERROR_REASON_UNAVAILABLE } }))
    expect(list().hidden).toBe(false)
    expect(document.getElementById('map-select-continue').disabled).toBe(false)
    radio(PARCEL_A).click()
    expect(submittedIds()).toEqual([PARCEL_A])
    expect(window.localStorage.getItem(PARCEL_VIEW_STORAGE_KEY)).toBeNull()
  })

  it('falls back to the list when the map failed before this script attached its listener', () => {
    setup({}, { lastEvent: new CustomEvent(EVENT_ERROR, { detail: { reason: ERROR_REASON_UNAVAILABLE } }) })
    expect(list().hidden).toBe(false)
    expect(document.getElementById('parcel-map-view').hidden).toBe(true)
  })

  it('allows toggling if storage reads and writes are blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    setup()
    expect(list().hidden).toBe(true)
    toggle()
    expect(list().hidden).toBe(false)
    toggle()
    expect(list().hidden).toBe(true)
  })

  it('falls back in-page without losing a selection if only session storage is blocked', () => {
    window.localStorage.setItem(PARCEL_VIEW_STORAGE_KEY, 'list')
    setup()
    radio(PARCEL_B).click()
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (this === window.sessionStorage) {
        throw new Error('blocked')
      }
      return setItem.call(this, key, value)
    })
    expect(clickToggle()).toBe(false)
    expect(list().hidden).toBe(true)
    expect(submittedIds()).toEqual([PARCEL_B])
    expect(window.localStorage.getItem(PARCEL_VIEW_STORAGE_KEY)).toBe('map')
  })

  describe('multi-select', () => {
    const multi = { multiSelect: true }
    const panel = (id) => list().querySelector(`[data-parcel-details="${id}"]`)

    it('renders the list as checkboxes using the same field name', () => {
      setup(multi)
      toggle(multi)
      expect([PARCEL_A, PARCEL_B].map((id) => [radio(id).type, radio(id).name])).toEqual([
        ['checkbox', 'landParcels'],
        ['checkbox', 'landParcels']
      ])
    })

    it('keeps every parcel selected on the map when switching to the list and back', () => {
      let page = setup(multi)
      page.ready()
      page.selectOnMap([PARCEL_A, PARCEL_B])
      expect(submittedIds()).toEqual([PARCEL_A, PARCEL_B])
      toggle(multi)
      expect([radio(PARCEL_A).checked, radio(PARCEL_B).checked]).toEqual([true, true])
      expect(submittedIds()).toEqual([PARCEL_A, PARCEL_B])
      page = toggle(multi)
      page.ready()
      expect(page.mapIds()).toEqual([PARCEL_A, PARCEL_B])
      expect(submittedIds()).toEqual([PARCEL_A, PARCEL_B])
    })

    it('keeps several list selections when the map is switched in-page', () => {
      window.localStorage.setItem(PARCEL_VIEW_STORAGE_KEY, 'list')
      const page = setup(multi)
      radio(PARCEL_A).click()
      radio(PARCEL_B).click()
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      expect(clickToggle()).toBe(false)
      page.ready()
      expect(page.mapIds()).toEqual([PARCEL_A, PARCEL_B])
      expect(submittedIds()).toEqual([PARCEL_A, PARCEL_B])
    })

    it('shows details for a single selection only and clears them when another parcel is added', async () => {
      setup(multi)
      toggle(multi)
      radio(PARCEL_A).click()
      await flush()
      expect(panel(PARCEL_A).querySelector('[data-parcel-action-count]').textContent).toBe('2')
      radio(PARCEL_B).click()
      await flush()
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect([panel(PARCEL_A).hidden, panel(PARCEL_B).hidden]).toEqual([false, false])
      expect(panel(PARCEL_A).querySelector('[data-parcel-actions-row]').hidden).toBe(true)
      expect(panel(PARCEL_A).querySelector('[data-parcel-requirements-row]').hidden).toBe(true)
      expect(document.getElementById('parcel-list-status').textContent).toBe('')
    })
  })

  describe('error summary links', () => {
    const errors = [{ text: 'Select a land parcel before you continue.', href: '#land-parcels' }]
    const errorLink = () => document.querySelector('.govuk-error-summary a')

    it('refocuses the map parcels from the map view without blocking the link moving focus', () => {
      const page = setup({ errors })
      let defaultPrevented
      errorLink().addEventListener('click', (event) => {
        defaultPrevented = event.defaultPrevented
      })
      errorLink().click()
      expect(page.map.focusParcels).toHaveBeenCalled()
      expect(defaultPrevented).toBe(false)
    })

    it('targets the list, without refocusing the map, from the list view', () => {
      window.localStorage.setItem(PARCEL_VIEW_STORAGE_KEY, 'list')
      const page = setup({ errors })
      expect(errorLink().getAttribute('href')).toBe('#land-parcels')
      errorLink().click()
      expect(page.map.focusParcels).not.toHaveBeenCalled()
    })

    it('refocuses the map after an in-page switch from a page that started in the list', () => {
      window.localStorage.setItem(PARCEL_VIEW_STORAGE_KEY, 'list')
      const page = setup({ errors })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      expect(clickToggle()).toBe(false)
      expect(errorLink().getAttribute('href')).toBe('#parcel-map')
      errorLink().click()
      expect(page.map.focusParcels).toHaveBeenCalled()
    })
  })
})
