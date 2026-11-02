// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { attachTooltip } from './tooltip.js'
import { LAYER_ID_FILL, LAYER_ID_LABEL_CLUSTER } from './config.js'
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
    expect(attachTooltip({ ml, store: { metaIndex: META_INDEX }, mapEl: orphan, cleanups })).toBeUndefined()
  })

  it('returns undefined when the map element is null', () => {
    expect(attachTooltip({ ml, store: { metaIndex: META_INDEX }, mapEl: null, cleanups })).toBeUndefined()
  })

  it('shows the tooltip with parcel id and area on a fill-layer hover', () => {
    const mapEl = makeMapEl()
    const tooltip = attachTooltip({ ml, store: { metaIndex: META_INDEX }, mapEl, cleanups })

    ml._emitLayer('mousemove', LAYER_ID_FILL, {
      features: [{ properties: { id: 'SD7148-9160' } }],
      lngLat: { lng: 0, lat: 0 }
    })

    expect(tooltip.hidden).toBe(false)
    expect(tooltip.textContent).toContain('SD7148 9160')
    expect(tooltip.textContent).toContain('2.5000 ha')
    expect(tooltip.textContent).not.toContain('Available actions')
  })

  it('ignores a fill-layer hover move that carries no feature', () => {
    const mapEl = makeMapEl()
    const tooltip = attachTooltip({ ml, store: { metaIndex: META_INDEX }, mapEl, cleanups })

    ml._emitLayer('mousemove', LAYER_ID_FILL, { features: [], lngLat: { lng: 0, lat: 0 } })

    expect(tooltip.hidden).toBe(true)
  })

  it('hides the tooltip instead of showing it when a cluster badge sits on top of the parcel at that point', () => {
    ml = makeMlMap({
      queryRenderedFeatures: vi
        .fn()
        .mockImplementation((_point, { layers }) =>
          layers.includes(LAYER_ID_LABEL_CLUSTER) ? [{ id: 'cluster' }] : []
        )
    })
    const mapEl = makeMapEl()
    const tooltip = attachTooltip({ ml, store: { metaIndex: META_INDEX }, mapEl, cleanups })
    tooltip.hidden = false

    ml._emitLayer('mousemove', LAYER_ID_FILL, {
      features: [{ properties: { id: 'SD7148-9160' } }],
      lngLat: { lng: 0, lat: 0 },
      point: { x: 5, y: 5 }
    })

    expect(tooltip.hidden).toBe(true)
  })

  it('toggles the pointer cursor and hides the tooltip on hover enter/leave', () => {
    const mapEl = makeMapEl()
    const tooltip = attachTooltip({ ml, store: { metaIndex: META_INDEX }, mapEl, cleanups })
    tooltip.hidden = false

    ml._emitLayer('mouseenter', LAYER_ID_FILL)
    expect(ml.getCanvas().style.cursor).toBe('pointer')

    ml._emitLayer('mouseleave', LAYER_ID_FILL)
    expect(ml.getCanvas().style.cursor).toBe('')
    expect(tooltip.hidden).toBe(true)
  })

  it('registers a cleanup per listener that removes it via ml.off', () => {
    const mapEl = makeMapEl()
    attachTooltip({ ml, store: { metaIndex: META_INDEX }, mapEl, cleanups })

    expect(cleanups).toHaveLength(ml.on.mock.calls.length)
    cleanups.forEach((off) => off())
    expect(ml.off).toHaveBeenCalledTimes(ml.on.mock.calls.length)
  })
})
