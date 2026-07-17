// @ts-nocheck
// TEMPORARY (TGC-1418): delete with basemap-comparison.js.
import { describe, it, expect, beforeEach } from 'vitest'
import { formatMetrics, initBasemapComparison } from './basemap-comparison.js'
import { EVENT_METRICS_UPDATE } from './basemap-metrics.js'

const baseMetrics = {
  provider: 'ordnance-survey',
  tileRequests: 0,
  tileErrors: 0,
  loadMs: null,
  firstTileMs: null,
  bytesTransferred: 0
}

describe('formatMetrics', () => {
  it('labels a known provider and shows loading before idle', () => {
    expect(formatMetrics(baseMetrics)).toBe('OS Maps · loading… · 0 tiles')
  })

  it('renders a full OSM snapshot with first-tile, idle, count, size and errors', () => {
    const line = formatMetrics({
      provider: 'openstreetmap',
      tileRequests: 3,
      tileErrors: 2,
      loadMs: 342,
      firstTileMs: 120,
      bytesTransferred: 2048
    })
    expect(line).toBe('OpenStreetMap · 120ms to first tile · 342ms to idle · 3 tiles · 2KB · 2 errors')
  })

  it('singularises one tile and one error', () => {
    const line = formatMetrics({ ...baseMetrics, loadMs: 10, tileRequests: 1, tileErrors: 1, bytesTransferred: 1024 })
    expect(line).toBe('OS Maps · 10ms to idle · 1 tile · 1KB · 1 error')
  })

  it('reports size not measurable once idle with zero bytes', () => {
    expect(formatMetrics({ ...baseMetrics, loadMs: 10 })).toBe('OS Maps · 10ms to idle · 0 tiles · size not measurable')
  })

  it('falls back to the raw provider string when unknown', () => {
    expect(formatMetrics({ ...baseMetrics, provider: 'mystery', loadMs: 10, bytesTransferred: 1024 })).toBe(
      'mystery · 10ms to idle · 0 tiles · 1KB'
    )
  })
})

describe('initBasemapComparison', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function makeMap() {
    const mapEl = document.createElement('parcel-map')
    mapEl.id = 'parcel-map'
    document.body.appendChild(mapEl)
    return mapEl
  }

  it('is a no-op when passed no element', () => {
    expect(() => initBasemapComparison(null)).not.toThrow()
  })

  it('self-disables when the toggle markup is absent', () => {
    const mapEl = makeMap()
    initBasemapComparison(mapEl)
    // No toggle in the DOM — a change on the map element must not set the attribute.
    expect(mapEl.getAttribute('basemap-provider')).toBeNull()
  })

  it('sets basemap-provider on the map when the toggle changes', () => {
    const mapEl = makeMap()
    const toggle = document.createElement('div')
    toggle.id = 'basemap-provider-toggle'
    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = 'basemapProviderDisplay'
    radio.value = 'openstreetmap'
    toggle.appendChild(radio)
    document.body.appendChild(toggle)

    initBasemapComparison(mapEl)
    radio.checked = true
    radio.dispatchEvent(new Event('change', { bubbles: true }))

    expect(mapEl.getAttribute('basemap-provider')).toBe('openstreetmap')
  })

  it('renders the metrics readout on a metrics event', () => {
    const mapEl = makeMap()
    const toggle = document.createElement('div')
    toggle.id = 'basemap-provider-toggle'
    document.body.appendChild(toggle)
    const metricsEl = document.createElement('p')
    metricsEl.id = 'basemap-metrics'
    document.body.appendChild(metricsEl)

    initBasemapComparison(mapEl)
    mapEl.dispatchEvent(new CustomEvent(EVENT_METRICS_UPDATE, { detail: { ...baseMetrics, loadMs: 10 } }))

    expect(metricsEl.textContent).toBe('OS Maps · 10ms to idle · 0 tiles · size not measurable')
  })
})
