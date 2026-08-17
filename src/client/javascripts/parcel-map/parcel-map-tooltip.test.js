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

  it('shows the tooltip with parcel id and area on a fill-layer hover', () => {
    const mapEl = makeMapEl()
    const tooltip = attachTooltip(ml, META_INDEX, mapEl, cleanups)

    ml._emitLayer('mousemove', LAYER_ID_FILL, {
      features: [{ properties: { id: 'SD7148-9160' } }],
      lngLat: { lng: 0, lat: 0 }
    })

    expect(tooltip.style.display).toBe('block')
    expect(tooltip.innerHTML).toContain('SD7148 9160')
    expect(tooltip.innerHTML).toContain('2.50 ha')
  })

  it('ignores a fill-layer hover move that carries no feature', () => {
    const mapEl = makeMapEl()
    const tooltip = attachTooltip(ml, META_INDEX, mapEl, cleanups)

    ml._emitLayer('mousemove', LAYER_ID_FILL, { features: [], lngLat: { lng: 0, lat: 0 } })

    expect(tooltip.style.display).not.toBe('block')
  })

  it('toggles the pointer cursor and hides the tooltip on hover enter/leave', () => {
    const mapEl = makeMapEl()
    const tooltip = attachTooltip(ml, META_INDEX, mapEl, cleanups)
    tooltip.style.display = 'block'

    ml._emitLayer('mouseenter', LAYER_ID_FILL)
    expect(ml.getCanvas().style.cursor).toBe('pointer')

    ml._emitLayer('mouseleave', LAYER_ID_FILL)
    expect(ml.getCanvas().style.cursor).toBe('')
    expect(tooltip.style.display).toBe('none')
  })

  it('registers a cleanup per listener that removes it via ml.off', () => {
    const mapEl = makeMapEl()
    attachTooltip(ml, META_INDEX, mapEl, cleanups)

    expect(cleanups).toHaveLength(ml.on.mock.calls.length)
    cleanups.forEach((off) => off())
    expect(ml.off).toHaveBeenCalledTimes(ml.on.mock.calls.length)
  })
})
