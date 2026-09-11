// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initParcelSelectPage } from './parcel-select-page.js'
import {
  ERROR_REASON_NO_PARCELS,
  ERROR_REASON_UNAVAILABLE,
  EVENT_ERROR,
  EVENT_READY,
  EVENT_SELECTION
} from './config.js'

const SSSI = 'site of special scientific interest (SSSI) consent'
const HEFER = 'a Historic Environment Farm Environment Record (HEFER)'
const INTRO = 'Some actions require:'
const noticeResponse = (items) => ({
  ok: true,
  json: () => Promise.resolve({ intro: items.length ? INTRO : '', items })
})
const EMPTY = { hidden: true, intro: '', items: [], status: '' }

function setupDom({ multiSelect = false, selectedParcels = '', errors = false, lastEvent = null } = {}) {
  document.body.innerHTML = `
    <input type="hidden" name="crumb" value="test-crumb">
    ${errors ? '<div class="govuk-error-summary"><a id="error-link" href="#parcel-map">There is a problem</a></div>' : ''}
    <div id="map-no-parcels-error" hidden></div>
    <div id="selected-parcels-inputs"></div>
    <button id="map-select-continue">Continue</button>
    <table>
      <tr><td id="parcel-map-total-count"></td></tr>
      <tr><td id="parcel-map-total-area"></td></tr>
    </table>
    <div id="selected-parcel-details" tabindex="-1" hidden>
      <span id="selected-parcel-reference"></span>
      <span id="selected-parcel-area"></span>
      <span id="selected-parcel-actions"></span>
      <a id="selected-parcel-change" href="#parcel-map">Change</a>
      <div id="selected-parcel-requirements-row" hidden>
        <p id="selected-parcel-requirements-intro"></p>
        <ul id="selected-parcel-requirements-list"></ul>
      </div>
      <output id="selected-parcel-requirements-status"></output>
      <div id="summary-parcel-no-actions" hidden></div>
    </div>
  `
  document.getElementById('selected-parcel-details').scrollIntoView = vi.fn()
  const mapEl = document.createElement('parcel-map')
  mapEl.id = 'parcel-map'
  mapEl.setAttribute('multi-select', multiSelect ? 'true' : 'false')
  mapEl.dataset.selectedParcels = selectedParcels
  mapEl.clearSelection = vi.fn()
  mapEl.selectParcels = vi.fn()
  mapEl.focusParcels = vi.fn()

  if (lastEvent) {
    mapEl.getLastEvent = (type) => (lastEvent.type === type ? lastEvent : null)
  }
  document.body.appendChild(mapEl)
  initParcelSelectPage(mapEl)
  return mapEl
}

const fire = (mapEl, type, detail) => mapEl.dispatchEvent(new CustomEvent(type, { detail }))
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const hiddenValues = () =>
  [...document.querySelectorAll('#selected-parcels-inputs input')].map((i) => ({ name: i.name, value: i.value }))
const requirements = () => ({
  hidden: document.getElementById('selected-parcel-requirements-row').hidden,
  intro: document.getElementById('selected-parcel-requirements-intro').textContent,
  items: [...document.querySelectorAll('#selected-parcel-requirements-list li')].map((li) => li.textContent),
  status: document.getElementById('selected-parcel-requirements-status').textContent
})

describe('initParcelSelectPage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    global.fetch = vi.fn().mockResolvedValue(noticeResponse([]))
  })

  it('is a no-op when passed no element', () => {
    expect(() => initParcelSelectPage(null)).not.toThrow()
  })

  it('disables Continue and shows the no-parcels error on a no-parcels error', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_ERROR, { reason: ERROR_REASON_NO_PARCELS })
    expect(document.getElementById('map-select-continue').disabled).toBe(true)
    expect(document.getElementById('map-no-parcels-error').hidden).toBe(false)
  })

  it('disables Continue but leaves the no-parcels summary hidden on an unavailable error', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_ERROR, { reason: ERROR_REASON_UNAVAILABLE })
    expect(document.getElementById('map-select-continue').disabled).toBe(true)
    expect(document.getElementById('map-no-parcels-error').hidden).toBe(true)
  })

  it('moves focus to the selected parcel details, but not for deselection', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, { selectedParcels: [{ id: 'SD7148-9160' }] })

    const details = document.getElementById('selected-parcel-details')
    expect(details.hidden).toBe(false)
    expect(document.activeElement).toBe(details)

    const change = document.getElementById('selected-parcel-change')
    change.focus()
    fire(mapEl, EVENT_SELECTION, { selectedParcels: [] })
    expect(document.activeElement).toBe(change)

    fire(mapEl, EVENT_SELECTION, { selectedParcels: [{ id: 'SD7148-9160' }] })
    expect(document.activeElement).toBe(details)
  })

  it('preserves error-summary focus when restoring a selection after a rejected submission', () => {
    const mapEl = setupDom({ selectedParcels: 'SD7148-9160', errors: true })
    mapEl.selectParcels.mockImplementation((ids) =>
      fire(mapEl, EVENT_SELECTION, { selectedParcels: ids.map((id) => ({ id })) })
    )
    const errorLink = document.getElementById('error-link')
    errorLink.focus()

    fire(mapEl, EVENT_READY, { parcelIds: ['SD7148-9160'], metaIndex: {} })

    expect(document.getElementById('selected-parcel-details').hidden).toBe(false)
    expect(document.activeElement).toBe(errorLink)
  })

  it('writes one hidden input per selected id', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedParcels: [{ id: 'SD7148-9160' }, { id: 'SD7148-9161' }]
    })
    expect(hiddenValues()).toEqual([
      { name: 'landParcels', value: 'SD7148-9160' },
      { name: 'landParcels', value: 'SD7148-9161' }
    ])
  })

  it('replaces rather than appends on the next selection', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedParcels: [{ id: 'SD7148-9160' }, { id: 'SD7148-9161' }]
    })
    fire(mapEl, EVENT_SELECTION, { selectedParcels: [{ id: 'SD7148-9162' }] })
    expect(hiddenValues()).toEqual([{ name: 'landParcels', value: 'SD7148-9162' }])
  })

  it('shows the selected parcel details, reading area and actions from metaIndex', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_READY, {
      parcelIds: ['SD7148-9160'],
      metaIndex: { 'SD7148-9160': { areaHa: 1.5, actionCount: 3 } }
    })
    fire(mapEl, EVENT_SELECTION, {
      selectedParcels: [{ id: 'SD7148-9160' }]
    })
    expect(document.getElementById('selected-parcel-details').hidden).toBe(false)
    expect(document.getElementById('selected-parcel-reference').textContent).toBe('SD7148 9160')
    expect(document.getElementById('selected-parcel-area').textContent).toBe('1.5000 ha')
    expect(document.getElementById('selected-parcel-actions').textContent).toBe('3')
  })

  it('shows no area when metaIndex has no entry for the selected parcel', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedParcels: [{ id: 'SD7148-9160' }]
    })
    expect(document.getElementById('selected-parcel-area').textContent).toBe('')
  })

  it('defaults action count to 0 when metaIndex has no entry for the selected parcel', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedParcels: [{ id: 'SD7148-9160' }]
    })
    expect(document.getElementById('selected-parcel-actions').textContent).toBe('0')
  })

  it('shows the no-actions message when the selected parcel has no available actions', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_READY, { parcelIds: ['SD7148-9160'], metaIndex: { 'SD7148-9160': { actionCount: 0 } } })

    fire(mapEl, EVENT_SELECTION, { selectedParcels: [{ id: 'SD7148-9160' }] })

    expect(document.getElementById('summary-parcel-no-actions').hidden).toBe(false)
  })

  it('hides the no-actions message when the selected parcel has available actions', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_READY, {
      parcelIds: ['SD7148-9160', 'SD7148-9161'],
      metaIndex: { 'SD7148-9160': { actionCount: 0 }, 'SD7148-9161': { actionCount: 1 } }
    })

    fire(mapEl, EVENT_SELECTION, { selectedParcels: [{ id: 'SD7148-9160' }] })
    fire(mapEl, EVENT_SELECTION, { selectedParcels: [{ id: 'SD7148-9161' }] })

    expect(document.getElementById('summary-parcel-no-actions').hidden).toBe(true)
  })

  it('hides the no-actions message when the parcel selection is cleared', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_READY, { parcelIds: ['SD7148-9160'], metaIndex: { 'SD7148-9160': { actionCount: 0 } } })

    fire(mapEl, EVENT_SELECTION, { selectedParcels: [{ id: 'SD7148-9160' }] })
    fire(mapEl, EVENT_SELECTION, { selectedParcels: [] })

    expect(document.getElementById('summary-parcel-no-actions').hidden).toBe(true)
  })

  it('hides the selected parcel details when no parcel or multiple parcels are selected', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedParcels: [{ id: 'SD7148-9160' }]
    })
    fire(mapEl, EVENT_SELECTION, { selectedParcels: [] })
    expect(document.getElementById('selected-parcel-details').hidden).toBe(true)
  })

  it('populates the map totals on ready', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_READY, {
      parcelIds: ['SD7148-9160', 'SD7148-9161'],
      metaIndex: { 'SD7148-9160': { areaHa: 1.5 }, 'SD7148-9161': { areaHa: 2.5 } }
    })
    expect(document.getElementById('parcel-map-total-count').textContent).toBe('2')
    expect(document.getElementById('parcel-map-total-area').textContent).toBe('4.0000')
  })

  it('defaults the map totals to zero when the ready event carries no detail', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_READY, undefined)
    expect(document.getElementById('parcel-map-total-count').textContent).toBe('0')
    expect(document.getElementById('parcel-map-total-area').textContent).toBe('0.0000')
  })

  it('catches up on EVENT_READY that fired before this script attached its listener', () => {
    setupDom({
      lastEvent: new CustomEvent(EVENT_READY, {
        detail: { parcelIds: ['SD7148-9160'], metaIndex: { 'SD7148-9160': { areaHa: 3.25 } } }
      })
    })
    expect(document.getElementById('parcel-map-total-count').textContent).toBe('1')
    expect(document.getElementById('parcel-map-total-area').textContent).toBe('3.2500')
  })

  it('catches up on EVENT_ERROR that fired before this script attached its listener', () => {
    setupDom({ lastEvent: new CustomEvent(EVENT_ERROR, { detail: { reason: ERROR_REASON_NO_PARCELS } }) })
    expect(document.getElementById('map-select-continue').disabled).toBe(true)
    expect(document.getElementById('map-no-parcels-error').hidden).toBe(false)
  })

  it('reselects the parcels the server sent back once the map is ready', () => {
    const mapEl = setupDom({ selectedParcels: 'SD7148-9160,SD7148-9161' })
    fire(mapEl, EVENT_READY, { parcelIds: ['SD7148-9160'], metaIndex: {} })
    expect(mapEl.selectParcels).toHaveBeenCalledWith(['SD7148-9160', 'SD7148-9161'])
  })

  it('ignores empty segments in the server-sent selection', () => {
    const mapEl = setupDom({ selectedParcels: 'SD7148-9160,' })
    fire(mapEl, EVENT_READY, { parcelIds: ['SD7148-9160'], metaIndex: {} })
    expect(mapEl.selectParcels).toHaveBeenCalledWith(['SD7148-9160'])
  })

  it('does not reselect anything when the server sent no selection', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_READY, { parcelIds: ['SD7148-9160'], metaIndex: {} })
    expect(mapEl.selectParcels).not.toHaveBeenCalled()
  })

  it('refocuses the map on the parcels when an error summary link is clicked, without blocking its own focus move', () => {
    const mapEl = setupDom({ errors: true })
    const errorLink = document.getElementById('error-link')
    let defaultPrevented = false
    errorLink.addEventListener('click', (e) => {
      defaultPrevented = e.defaultPrevented
    })
    errorLink.click()
    expect(mapEl.focusParcels).toHaveBeenCalled()
    expect(defaultPrevented).toBe(false)
  })

  it('clears the map selection, without navigating, when the Change link is clicked', () => {
    const mapEl = setupDom()
    const changeLink = document.getElementById('selected-parcel-change')
    let defaultPrevented = false
    changeLink.addEventListener('click', (e) => {
      defaultPrevented = e.defaultPrevented
    })
    changeLink.click()
    expect(mapEl.clearSelection).toHaveBeenCalled()
    expect(defaultPrevented).toBe(true)
  })

  describe('requirements row', () => {
    const select = (mapEl, ids) => fire(mapEl, EVENT_SELECTION, { selectedParcels: ids.map((id) => ({ id })) })

    it('posts the selected parcel to the consents route, with no action list to narrow it', async () => {
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      await flush()

      expect(global.fetch).toHaveBeenCalledWith('/api/land-grants/actions/SD7148-9160/consents', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-crumb' },
        body: '{}'
      })
    })

    it('lists every requirement the server returns, and announces them as one utterance', async () => {
      global.fetch = vi.fn().mockResolvedValue(noticeResponse([SSSI, HEFER]))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      await flush()

      expect(requirements()).toEqual({
        hidden: false,
        intro: INTRO,
        items: [SSSI, HEFER],
        status: `${INTRO} ${SSSI}, ${HEFER}`
      })
    })

    it('renders a single requirement as one bullet', async () => {
      global.fetch = vi.fn().mockResolvedValue(noticeResponse([HEFER]))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      await flush()

      expect(requirements()).toEqual({ hidden: false, intro: INTRO, items: [HEFER], status: `${INTRO} ${HEFER}` })
    })

    it.each([
      ['no requirements', () => Promise.resolve(noticeResponse([]))],
      ['a malformed response body', () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })],
      ['a non-array items field', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ intro: 'x' }) })],
      ['a non-2xx response', () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })],
      ['a network error', () => Promise.reject(new Error('offline'))]
    ])('keeps the row hidden and Continue usable for %s', async (_label, respond) => {
      global.fetch = vi.fn().mockImplementation(respond)
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      await flush()

      expect(requirements()).toEqual(EMPTY)
      expect(document.getElementById('map-select-continue').disabled).toBe(false)
    })

    it('removes the previous bullets when the selection changes to a parcel with none', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(noticeResponse([SSSI]))
        .mockResolvedValueOnce(noticeResponse([]))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      await flush()
      select(mapEl, ['SD7148-9161'])
      await flush()

      expect(requirements()).toEqual(EMPTY)
    })

    it('clears the requirements immediately on deselection, before any response lands', async () => {
      global.fetch = vi.fn().mockResolvedValue(noticeResponse([SSSI]))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      await flush()
      select(mapEl, [])

      expect(requirements()).toEqual(EMPTY)
    })

    it('does not reveal the row when the response arrives after deselection', async () => {
      let resolveConsents
      global.fetch = vi.fn().mockReturnValue(new Promise((resolve) => (resolveConsents = resolve)))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      select(mapEl, [])
      resolveConsents(noticeResponse([SSSI]))
      await flush()

      expect(requirements()).toEqual(EMPTY)
    })

    it('does not reveal the row when the response arrives after a second parcel is added', async () => {
      let resolveConsents
      global.fetch = vi.fn().mockReturnValueOnce(new Promise((resolve) => (resolveConsents = resolve)))
      const mapEl = setupDom({ multiSelect: true })

      select(mapEl, ['SD7148-9160'])
      select(mapEl, ['SD7148-9160', 'SD7148-9161'])
      resolveConsents(noticeResponse([HEFER]))
      await flush()

      expect(requirements()).toEqual(EMPTY)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('does not let a delayed first response overwrite a faster second selection', async () => {
      let resolveFirst
      global.fetch = vi
        .fn()
        .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce(noticeResponse([HEFER]))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      select(mapEl, ['SD7148-9161'])
      await flush()
      resolveFirst(noticeResponse([SSSI]))
      await flush()

      expect(requirements()).toEqual({ hidden: false, intro: INTRO, items: [HEFER], status: `${INTRO} ${HEFER}` })
    })
  })
})
