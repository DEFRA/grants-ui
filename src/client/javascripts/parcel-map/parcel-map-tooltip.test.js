// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest'
import { attachTooltip } from './parcel-map-tooltip.js'
import { LAYER_ID_FILL } from './config.js'
import { makeMlMap } from './test-helpers.js'

const META_INDEX = {
  'SD7148-9160': { id: 'SD7148-9160', sheet_id: 'SD7148', parcel_id: '9160', areaHa: 2.5 }
}

function makeMapEl() {
  const wrapper = document.createElement('div')
  const mapEl = document.createElement('div')
  wrapper.appendChild(mapEl)
  document.body.appendChild(wrapper)
  return mapEl
}

describe('attachTooltip', () => {
  let ml
  let cleanups

  beforeEach(() => {
    document.body.innerHTML = ''
    ml = makeMlMap()
    cleanups = []
  })

  it('returns undefined when the map element has no wrapper parent', () => {
    const orphan = document.createElement('div')
    expect(attachTooltip(ml, META_INDEX, orphan, cleanups)).toBeUndefined()
  })

  it('returns undefined when the map element is null', () => {
    expect(attachTooltip(ml, META_INDEX, null, cleanups)).toBeUndefined()
  })

  it('shows the tooltip with parcel id and area on a fill-layer click', () => {
    const mapEl = makeMapEl()
    const tooltip = attachTooltip(ml, META_INDEX, mapEl, cleanups)

    ml._emitLayer('click', LAYER_ID_FILL, {
      features: [{ properties: { id: 'SD7148-9160' } }],
      lngLat: { lng: 0, lat: 0 }
    })

    expect(tooltip.style.display).toBe('block')
    expect(tooltip.innerHTML).toContain('SD7148-9160')
    expect(tooltip.innerHTML).toContain('2.50 ha')
  })

  it('ignores a fill-layer click that carries no feature', () => {
    const mapEl = makeMapEl()
    const tooltip = attachTooltip(ml, META_INDEX, mapEl, cleanups)

    ml._emitLayer('click', LAYER_ID_FILL, { features: [], lngLat: { lng: 0, lat: 0 } })

    expect(tooltip.style.display).not.toBe('block')
  })

  it('hides the tooltip on a map click that lands outside every parcel', () => {
    const mapEl = makeMapEl()
    const tooltip = attachTooltip(ml, META_INDEX, mapEl, cleanups)
    tooltip.style.display = 'block'

    ml.queryRenderedFeatures.mockReturnValue([]) // nothing under the click
    ml._emit('click', { point: { x: 5, y: 5 } })

    expect(tooltip.style.display).toBe('none')
  })

  it('leaves the tooltip alone on a map click that lands on a parcel', () => {
    const mapEl = makeMapEl()
    const tooltip = attachTooltip(ml, META_INDEX, mapEl, cleanups)
    tooltip.style.display = 'block'

    ml.queryRenderedFeatures.mockReturnValue([{ id: 'SD7148-9160' }]) // hit a parcel
    ml._emit('click', { point: { x: 5, y: 5 } })

    expect(tooltip.style.display).toBe('block')
  })

  it('toggles the pointer cursor on hover enter/leave', () => {
    const mapEl = makeMapEl()
    attachTooltip(ml, META_INDEX, mapEl, cleanups)

    ml._emitLayer('mouseenter', LAYER_ID_FILL)
    expect(ml.getCanvas().style.cursor).toBe('pointer')

    ml._emitLayer('mouseleave', LAYER_ID_FILL)
    expect(ml.getCanvas().style.cursor).toBe('')
  })

  it('registers a cleanup per listener that removes it via ml.off', () => {
    const mapEl = makeMapEl()
    attachTooltip(ml, META_INDEX, mapEl, cleanups)

    expect(cleanups).toHaveLength(ml.on.mock.calls.length)
    cleanups.forEach((off) => off())
    expect(ml.off).toHaveBeenCalledTimes(ml.on.mock.calls.length)
  })
})
