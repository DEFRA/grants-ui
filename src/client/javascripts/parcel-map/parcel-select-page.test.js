// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initParcelSelectPage } from './parcel-select-page.js'
import {
  EVENT_READY,
  EVENT_ERROR,
  EVENT_SELECTION,
  ERROR_REASON_NO_PARCELS,
  ERROR_REASON_UNAVAILABLE
} from './config.js'

const noticeResponse = (text) => ({ ok: true, json: () => Promise.resolve({ text }) })

function setupDom({ multiSelect = false } = {}) {
  document.body.innerHTML = `
    <input type="hidden" name="crumb" value="test-crumb">
    <div id="map-no-parcels-error" hidden></div>
    <div id="selected-parcels-inputs"></div>
    <button id="map-select-continue">Continue</button>
    <table>
      <tr><td id="parcel-map-total-count"></td></tr>
      <tr><td id="parcel-map-total-area"></td></tr>
    </table>
    <div id="selected-parcel-details" hidden>
      <span id="selected-parcel-reference"></span>
      <span id="selected-parcel-area"></span>
      <a id="selected-parcel-change" href="#parcel-map">Change</a>
      <div id="selected-parcel-additional-requirements-row" hidden>
        <span id="selected-parcel-additional-requirements"></span>
      </div>
      <output id="selected-parcel-additional-requirements-status"></output>
    </div>
  `
  const mapEl = document.createElement('parcel-map')
  mapEl.id = 'parcel-map'
  mapEl.setAttribute('multi-select', multiSelect ? 'true' : 'false')
  mapEl.clearSelection = () => {}
  document.body.appendChild(mapEl)
  initParcelSelectPage(mapEl)
  return mapEl
}

const fire = (mapEl, type, detail) => mapEl.dispatchEvent(new CustomEvent(type, { detail }))
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const hiddenValues = () =>
  [...document.querySelectorAll('#selected-parcels-inputs input')].map((i) => ({ name: i.name, value: i.value }))
const additionalRequirements = () => ({
  hidden: document.getElementById('selected-parcel-additional-requirements-row').hidden,
  text: document.getElementById('selected-parcel-additional-requirements').textContent,
  status: document.getElementById('selected-parcel-additional-requirements-status').textContent
})

describe('initParcelSelectPage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    global.fetch = vi.fn().mockResolvedValue(noticeResponse(''))
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

  it('writes one hidden input per selected id', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedParcels: [
        { id: 'SD7148-9160', areaHa: 1 },
        { id: 'SD7148-9161', areaHa: 2 }
      ]
    })
    expect(hiddenValues()).toEqual([
      { name: 'landParcels', value: 'SD7148-9160' },
      { name: 'landParcels', value: 'SD7148-9161' }
    ])
  })

  it('replaces rather than appends on the next selection', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedParcels: [
        { id: 'SD7148-9160', areaHa: 1 },
        { id: 'SD7148-9161', areaHa: 2 }
      ]
    })
    fire(mapEl, EVENT_SELECTION, { selectedParcels: [{ id: 'SD7148-9162', areaHa: 3 }] })
    expect(hiddenValues()).toEqual([{ name: 'landParcels', value: 'SD7148-9162' }])
  })

  it('shows the selected parcel details when exactly one parcel is selected', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedParcels: [{ id: 'SD7148-9160', areaHa: 1.5 }]
    })
    expect(document.getElementById('selected-parcel-details').hidden).toBe(false)
    expect(document.getElementById('selected-parcel-reference').textContent).toBe('SD7148 9160')
    expect(document.getElementById('selected-parcel-area').textContent).toBe('1.5000 hectares')
  })

  it('hides the selected parcel details when no parcel or multiple parcels are selected', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedParcels: [{ id: 'SD7148-9160', areaHa: 1.5 }]
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
    document.body.innerHTML = `
      <div id="map-no-parcels-error" hidden></div>
      <div id="selected-parcels-inputs"></div>
      <button id="map-select-continue">Continue</button>
      <table>
        <tr><td id="parcel-map-total-count"></td></tr>
        <tr><td id="parcel-map-total-area"></td></tr>
      </table>
      <div id="selected-parcel-details" hidden></div>
    `
    const mapEl = document.createElement('parcel-map')
    mapEl.id = 'parcel-map'
    const readyEvent = new CustomEvent(EVENT_READY, {
      detail: { parcelIds: ['SD7148-9160'], metaIndex: { 'SD7148-9160': { areaHa: 3.25 } } }
    })
    // Simulates customElements.define() upgrading the element and it reaching
    // STATE_READY before parcel-select-page.js's own <script type="module"> runs.
    mapEl.getLastEvent = (type) => (type === EVENT_READY ? readyEvent : null)
    document.body.appendChild(mapEl)

    initParcelSelectPage(mapEl)

    expect(document.getElementById('parcel-map-total-count').textContent).toBe('1')
    expect(document.getElementById('parcel-map-total-area').textContent).toBe('3.2500')
  })

  it('catches up on EVENT_ERROR that fired before this script attached its listener', () => {
    document.body.innerHTML = `
      <div id="map-no-parcels-error" hidden></div>
      <div id="selected-parcels-inputs"></div>
      <button id="map-select-continue">Continue</button>
      <table>
        <tr><td id="parcel-map-total-count"></td></tr>
        <tr><td id="parcel-map-total-area"></td></tr>
      </table>
      <div id="selected-parcel-details" hidden></div>
    `
    const mapEl = document.createElement('parcel-map')
    mapEl.id = 'parcel-map'
    const errorEvent = new CustomEvent(EVENT_ERROR, { detail: { reason: ERROR_REASON_NO_PARCELS } })
    mapEl.getLastEvent = (type) => (type === EVENT_ERROR ? errorEvent : null)
    document.body.appendChild(mapEl)

    initParcelSelectPage(mapEl)

    expect(document.getElementById('map-select-continue').disabled).toBe(true)
    expect(document.getElementById('map-no-parcels-error').hidden).toBe(false)
  })

  it('clears the map selection when the Change link is clicked', () => {
    const mapEl = setupDom()
    mapEl.clearSelection = vi.fn()
    const changeLink = document.getElementById('selected-parcel-change')
    changeLink.click()
    expect(mapEl.clearSelection).toHaveBeenCalled()
  })

  it('does not navigate when the Change link is clicked', () => {
    setupDom()
    const changeLink = document.getElementById('selected-parcel-change')
    let defaultPrevented = false
    changeLink.addEventListener('click', (e) => {
      defaultPrevented = e.defaultPrevented
    })
    changeLink.click()
    expect(defaultPrevented).toBe(true)
  })

  describe('additional requirements row', () => {
    const select = (mapEl, ids) =>
      fire(mapEl, EVENT_SELECTION, { selectedParcels: ids.map((id) => ({ id, areaHa: 1 })) })

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

    it('shows and announces whatever notice the server returns', async () => {
      const notice = 'SSSI consent and an SFI HEFER may apply to some actions'
      global.fetch = vi.fn().mockResolvedValue(noticeResponse(notice))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      await flush()

      expect(additionalRequirements()).toEqual({ hidden: false, text: notice, status: notice })
    })

    it.each([
      ['empty notice text', () => Promise.resolve(noticeResponse(''))],
      ['a malformed response body', () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })],
      ['a non-2xx response', () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })],
      ['a network error', () => Promise.reject(new Error('offline'))]
    ])('keeps the row hidden and Continue usable for %s', async (_label, respond) => {
      global.fetch = vi.fn().mockImplementation(respond)
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      await flush()

      expect(additionalRequirements()).toEqual({ hidden: true, text: '', status: '' })
      expect(document.getElementById('map-select-continue').disabled).toBe(false)
    })

    it('removes the previous requirement text when the selection changes to a parcel with none', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(noticeResponse('SSSI consent may apply to some actions'))
        .mockResolvedValueOnce(noticeResponse(''))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      await flush()
      select(mapEl, ['SD7148-9161'])
      await flush()

      expect(additionalRequirements()).toEqual({ hidden: true, text: '', status: '' })
    })

    it('clears the requirement text immediately on deselection, before any response lands', async () => {
      global.fetch = vi.fn().mockResolvedValue(noticeResponse('SSSI consent may apply to some actions'))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      await flush()
      select(mapEl, [])

      expect(additionalRequirements()).toEqual({ hidden: true, text: '', status: '' })
    })

    it('does not reveal the row when the response arrives after deselection', async () => {
      let resolveConsents
      global.fetch = vi.fn().mockReturnValue(new Promise((resolve) => (resolveConsents = resolve)))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      select(mapEl, [])
      resolveConsents(noticeResponse('SSSI consent may apply to some actions'))
      await flush()

      expect(additionalRequirements()).toEqual({ hidden: true, text: '', status: '' })
    })

    it('does not reveal the row when the response arrives after a second parcel is added', async () => {
      let resolveConsents
      global.fetch = vi.fn().mockReturnValueOnce(new Promise((resolve) => (resolveConsents = resolve)))
      const mapEl = setupDom({ multiSelect: true })

      select(mapEl, ['SD7148-9160'])
      select(mapEl, ['SD7148-9160', 'SD7148-9161'])
      resolveConsents(noticeResponse('An SFI HEFER may apply to some actions'))
      await flush()

      expect(additionalRequirements()).toEqual({ hidden: true, text: '', status: '' })
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('does not let a delayed first response overwrite a faster second selection', async () => {
      let resolveFirst
      global.fetch = vi
        .fn()
        .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce(noticeResponse('An SFI HEFER may apply to some actions'))
      const mapEl = setupDom()

      select(mapEl, ['SD7148-9160'])
      select(mapEl, ['SD7148-9161'])
      await flush()
      resolveFirst(noticeResponse('SSSI consent may apply to some actions'))
      await flush()

      const expected = 'An SFI HEFER may apply to some actions'
      expect(additionalRequirements()).toEqual({ hidden: false, text: expected, status: expected })
    })
  })
})
