// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest'
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
    <p id="map-hint" hidden></p>
    <div id="selected-parcels-inputs"></div>
    <p id="parcel-selection-summary" hidden>No parcel selected.</p>
    <button id="map-select-continue">Continue</button>
  `
  const mapEl = document.createElement('parcel-map')
  mapEl.id = 'parcel-map'
  mapEl.setAttribute('multi-select', multiSelect ? 'true' : 'false')
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

  it('unhides the hint and summary on ready', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_READY)
    expect(document.getElementById('map-hint').hidden).toBe(false)
    expect(document.getElementById('parcel-selection-summary').hidden).toBe(false)
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
    fire(mapEl, EVENT_SELECTION, { selectedIds: ['SD7148-9160', 'SD7148-9161'] })
    expect(hiddenValues()).toEqual([
      { name: 'landParcels', value: 'SD7148-9160' },
      { name: 'landParcels', value: 'SD7148-9161' }
    ])
  })

  it('replaces rather than appends on the next selection', () => {
    const mapEl = setupDom()
    fire(mapEl, EVENT_SELECTION, { selectedIds: ['SD7148-9160', 'SD7148-9161'] })
    fire(mapEl, EVENT_SELECTION, { selectedIds: ['SD7148-9162'] })
    expect(hiddenValues()).toEqual([{ name: 'landParcels', value: 'SD7148-9162' }])
  })

  it.each([
    [false, ['SD7148-9160'], 'Selected: SD7148-9160', 'No parcel selected.'],
    [true, ['SD7148-9160', 'SD7148-9161'], 'Selected: SD7148-9160, SD7148-9161', 'No parcels selected.']
  ])('summary text (multiSelect=%s): populated then cleared', (multiSelect, ids, populated, empty) => {
    const mapEl = setupDom({ multiSelect })
    const summary = document.getElementById('parcel-selection-summary')

    fire(mapEl, EVENT_SELECTION, { selectedIds: ids })
    expect(summary.textContent).toBe(populated)

    fire(mapEl, EVENT_SELECTION, { selectedIds: [] })
    expect(summary.textContent).toBe(empty)
  })
})
