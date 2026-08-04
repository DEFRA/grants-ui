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

function setupDom({ multiSelect = false } = {}) {
  document.body.innerHTML = `
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
const hiddenValues = () =>
  [...document.querySelectorAll('#selected-parcels-inputs input')].map((i) => ({ name: i.name, value: i.value }))

describe('initParcelSelectPage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
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
      selectedIds: ['SD7148-9160', 'SD7148-9161'],
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
      selectedIds: ['SD7148-9160', 'SD7148-9161'],
      selectedParcels: [
        { id: 'SD7148-9160', areaHa: 1 },
        { id: 'SD7148-9161', areaHa: 2 }
      ]
    })
    fire(mapEl, EVENT_SELECTION, { selectedIds: ['SD7148-9162'], selectedParcels: [{ id: 'SD7148-9162', areaHa: 3 }] })
    expect(hiddenValues()).toEqual([{ name: 'landParcels', value: 'SD7148-9162' }])
  })

  it('shows the selected parcel details when exactly one parcel is selected', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedIds: ['SD7148-9160'],
      selectedParcels: [{ id: 'SD7148-9160', areaHa: 1.5 }]
    })
    expect(document.getElementById('selected-parcel-details').hidden).toBe(false)
    expect(document.getElementById('selected-parcel-reference').textContent).toBe('SD7148-9160')
    expect(document.getElementById('selected-parcel-area').textContent).toBe('1.5000 hectares')
  })

  it('hides the selected parcel details when no parcel or multiple parcels are selected', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, {
      selectedIds: ['SD7148-9160'],
      selectedParcels: [{ id: 'SD7148-9160', areaHa: 1.5 }]
    })
    fire(mapEl, EVENT_SELECTION, { selectedIds: [], selectedParcels: [] })
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
})
