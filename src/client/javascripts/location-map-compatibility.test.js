// @vitest-environment jsdom
import { createRequire } from 'node:module'
import path from 'node:path'
import nunjucks from 'nunjucks'
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { map } from '@defra/forms-engine-plugin/shared.js'
import { processLocation } from './location-map.js'
import { initialiseComponentMaps } from './component-maps.js'

// jsdom has no media queries; supply only the missing browser API.
vi.hoisted(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {}
  }))
})

vi.mock('@defra/forms-engine-plugin/shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, map: { ...actual.map, createMap: vi.fn() } }
})

const require = createRequire(import.meta.url)
const environment = nunjucks.configure(
  [
    path.dirname(require.resolve('@defra/forms-engine-plugin/templates/index.html')),
    path.join(path.dirname(require.resolve('govuk-frontend/package.json')), 'dist')
  ],
  { autoescape: true }
)
const CONFIG = { apiPath: '/api', assetPath: '/public/assets' }
const UK_VIEW = { center: [-2.421975, 53.825564], zoom: '6' }
const POSTCODE_CENTER = [-0.1283539, 51.5039908]
const MARKER_CENTER = [-0.12, 51.5]
const CASES = [
  {
    type: 'LatLongField',
    values: ['51.5039908', '0'],
    center: [0, 51.5039908],
    changed: ['51.5074', '-0.1276'],
    changedCenter: [-0.1276, 51.5074],
    written: ['51.5000000', '-0.1200000']
  },
  {
    type: 'EastingNorthingField',
    values: ['530000', '180000'],
    center: POSTCODE_CENTER,
    changed: ['531000', '181000'],
    changedCenter: [-0.1135832, 51.5127467],
    written: ['530591', '179571']
  },
  {
    type: 'OsGridRefField',
    values: ['TQ 30000 80000'],
    center: POSTCODE_CENTER,
    changed: ['TQ 31000 81000'],
    changedCenter: [-0.1135832, 51.5127467],
    written: ['TQ 30591 79571']
  }
]
const maps = new Map()

function renderLocation(type, values, name = 'location') {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = environment.renderString(
    `{% from "components/${type.toLowerCase()}.html" import ${type} %}{{ ${type}(component) }}`,
    {
      component: {
        type,
        model: {
          name,
          value: values[0],
          fieldset: { legend: { text: 'Location' } },
          items: values.map((value, index) => ({
            id: `${name}-${index}`,
            name: `${name}__${index}`,
            label: `Coordinate ${index}`,
            value
          }))
        }
      }
    }
  )
  const field = wrapper.querySelector('.app-location-field')
  document.querySelector('form').append(field)
  return field
}

beforeEach(() => {
  vi.clearAllMocks()
  maps.clear()
  Object.assign(map.defaultConfig, UK_VIEW)
  document.body.innerHTML = '<form><button type="submit">Continue</button></form>'
  window.componentMapsEnabled = true
  vi.mocked(map.createMap).mockImplementation((id, initialConfig) => {
    // Drive the adapter's event boundary without constructing a WebGL renderer.
    const events = new window.EventTarget()
    const instance = {
      on: vi.fn((name, handler) => events.addEventListener(name, ({ detail }) => handler(detail))),
      addMarker: vi.fn(),
      addPanel: vi.fn()
    }
    const fixture = {
      map: instance,
      interactPlugin: { enable: vi.fn() },
      provider: { flyTo: vi.fn() },
      initialConfig: { ...initialConfig, center: [...initialConfig.center] },
      emit: (name, detail) => events.dispatchEvent(new window.CustomEvent(name, { detail }))
    }
    maps.set(id, fixture)
    return fixture
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  delete window.componentMapsEnabled
  Object.assign(map.defaultConfig, UK_VIEW)
  vi.unstubAllGlobals()
})
afterAll(() => vi.unstubAllGlobals())

describe('location adapter compatibility with the installed forms engine', () => {
  test.each(CASES)('reads real $type template markup using real coordinate helpers', ({ type, values, center }) => {
    const field = renderLocation(type, values)
    processLocation(CONFIG, field, 0)
    const createMap = vi.mocked(map.createMap)
    expect(createMap).toHaveBeenCalledTimes(1)
    const [id, initialConfig] = createMap.mock.calls[0]
    expect(id).toBe('map_0')
    expect(initialConfig.zoom).toBe('16')
    expect(initialConfig.center[0]).toBeCloseTo(center[0], 5)
    expect(initialConfig.center[1]).toBeCloseTo(center[1], 5)
    expect(initialConfig.markers).toEqual([{ id: 'location', coords: initialConfig.center }])
    expect([...field.querySelectorAll('input')].map((input) => input.value)).toEqual(values)
  })

  test.each(CASES)(
    'binds $type input changes and marker events using real coordinate helpers',
    ({ type, values, changed, changedCenter, written }) => {
      const field = renderLocation(type, values)
      processLocation(CONFIG, field, 0)
      const fixture = maps.get('map_0')
      const inputs = [...field.querySelectorAll('input')]
      expect(fixture.interactPlugin.enable).not.toHaveBeenCalled()
      fixture.emit(map.EVENTS.mapReady, { map: fixture.provider })
      expect(fixture.interactPlugin.enable).toHaveBeenCalledTimes(1)
      expect(fixture.map.addPanel).not.toHaveBeenCalled()
      inputs.forEach((input, index) => {
        input.value = changed[index]
        input.dispatchEvent(new window.Event('change'))
      })
      const [markerId, center] = fixture.map.addMarker.mock.lastCall
      expect(markerId).toBe('location')
      expect(center[0]).toBeCloseTo(changedCenter[0], 5)
      expect(center[1]).toBeCloseTo(changedCenter[1], 5)
      expect(fixture.provider.flyTo).toHaveBeenLastCalledWith({ center, zoom: 14, essential: true })
      fixture.emit(map.EVENTS.interactMarkerChange, { coords: MARKER_CENTER })
      expect(inputs.map((input) => input.value)).toEqual(written)
    }
  )

  test('retains zero longitude in saved answers and input changes', () => {
    const field = renderLocation('LatLongField', ['51.5039908', '0'])
    processLocation(CONFIG, field, 0)
    const fixture = maps.get('map_0')
    expect(fixture.initialConfig.center).toEqual([0, 51.5039908])
    fixture.emit(map.EVENTS.mapReady, { map: fixture.provider })
    const inputs = [...field.querySelectorAll('input')]
    fixture.emit(map.EVENTS.interactMarkerChange, { coords: [-0.1276, 51.5074] })
    inputs[1].value = '0'
    inputs[1].dispatchEvent(new window.Event('change'))
    expect(fixture.map.addMarker).toHaveBeenLastCalledWith('location', [0, 51.5074])
    expect(fixture.provider.flyTo).toHaveBeenLastCalledWith({ center: [0, 51.5074], zoom: 14, essential: true })
  })

  test('uses independent saved-answer, postcode and UK views with per-component help options', async () => {
    CASES.forEach(({ type, values }, index) => renderLocation(type, values, `saved${index}`))
    renderLocation('LatLongField', ['51.5074', '-0.1276'], 'help')
    const empty = renderLocation('LatLongField', ['', ''], 'empty')
    renderLocation('LatLongField', ['', ''], 'overview')
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="component-map-settings" data-map-postcode="SW1A 1AA" hidden>
        <div data-map-component="help" data-hide-map-help-panel="false"></div>
        <div data-map-component="overview" data-zoom-to-postcode="false"></div>
      </div>`
    )
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { GAZETTEER_ENTRY: { NAME1: 'SW1A 1AA', LOCAL_TYPE: 'Postcode', GEOMETRY_X: 530000, GEOMETRY_Y: 180000 } }
        ]
      })
    })
    vi.stubGlobal('fetch', fetch)
    await initialiseComponentMaps()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/api/geocode-proxy?query=SW1A%201AA', expect.any(Object))
    expect(maps.size).toBe(6)
    for (const index of [0, 1, 2]) {
      const { initialConfig } = maps.get(`map_${index}`)
      expect(initialConfig.center[0]).toBeCloseTo(CASES[index].center[0], 5)
      expect(initialConfig.center[1]).toBeCloseTo(CASES[index].center[1], 5)
      expect(initialConfig.zoom).toBe('16')
      expect(initialConfig.markers).toEqual([{ id: 'location', coords: initialConfig.center }])
    }
    const postcode = maps.get('map_4')
    expect(postcode.initialConfig.center[0]).toBeCloseTo(POSTCODE_CENTER[0], 5)
    expect(postcode.initialConfig.center[1]).toBeCloseTo(POSTCODE_CENTER[1], 5)
    expect(postcode.initialConfig.zoom).toBe(10)
    expect(postcode.initialConfig.markers).toBeUndefined()
    expect(maps.get('map_5').initialConfig).toEqual(UK_VIEW)
    expect(map.defaultConfig).toEqual(UK_VIEW)
    maps.forEach((fixture) => {
      fixture.emit(map.EVENTS.mapReady, { map: fixture.provider })
      expect(fixture.interactPlugin.enable).toHaveBeenCalledTimes(1)
    })
    for (const index of [0, 1, 2, 4, 5]) {
      expect(maps.get(`map_${index}`).map.addPanel).not.toHaveBeenCalled()
    }
    expect(maps.get('map_3').map.addPanel).toHaveBeenCalledWith(
      'info',
      expect.objectContaining({ label: 'How to use the map', desktop: expect.objectContaining({ open: true }) })
    )
    const inputs = [...empty.querySelectorAll('input')]
    inputs[0].value = '51.5074'
    inputs[0].dispatchEvent(new window.Event('change'))
    expect(postcode.map.addMarker).not.toHaveBeenCalled()
    expect(postcode.provider.flyTo).not.toHaveBeenCalled()
    inputs[1].value = '0'
    inputs[1].dispatchEvent(new window.Event('change'))
    expect(postcode.map.addMarker).toHaveBeenCalledWith('location', [0, 51.5074])
    expect(postcode.provider.flyTo).toHaveBeenCalledWith({ center: [0, 51.5074], zoom: 14, essential: true })
  })

  test('coordinate conversions retain their object shapes, units and grid reference format', () => {
    const point = map.eastingNorthingToLatLong({ easting: 530000, northing: 180000 })
    expect(point.lat).toBeCloseTo(51.5039908, 5)
    expect(point.long).toBeCloseTo(-0.1283539, 5)
    const grid = map.latLongToEastingNorthing(point)
    expect(grid.easting).toBeCloseTo(530000, 0)
    expect(grid.northing).toBeCloseTo(180000, 0)
    const reference = map.latLongToOsGridRef(point)
    expect(reference).toMatch(/^TQ \d{5} \d{5}$/)
    // Datum conversion can move the truncated grid reference by a metre.
    const roundTrip = map.osGridRefToLatLong(reference)
    expect(roundTrip.lat).toBeCloseTo(point.lat, 4)
    expect(roundTrip.long).toBeCloseTo(point.long, 4)
    expect(map.osGridRefToLatLong('TQ 30000 80000')).toEqual(point)
  })
})
