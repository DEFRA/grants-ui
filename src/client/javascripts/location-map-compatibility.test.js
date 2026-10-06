import { createRequire } from 'node:module'
import path from 'node:path'
import nunjucks from 'nunjucks'
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'
import { map } from '@defra/forms-engine-plugin/shared.js'
import { processLocation } from './location-map.js'

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
const CASES = [
  { type: 'LatLongField', values: ['51.5039908', '-0.1283539'] },
  { type: 'EastingNorthingField', values: ['530000', '180000'] },
  { type: 'OsGridRefField', values: ['TQ 30000 80000'] }
]

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})
afterAll(() => vi.unstubAllGlobals())

describe('location adapter compatibility with the installed forms engine', () => {
  test.each(CASES)('reads real $type template markup using real coordinate helpers', ({ type, values }) => {
    document.body.innerHTML = environment.renderString(
      `{% from "components/${type.toLowerCase()}.html" import ${type} %}{{ ${type}(component) }}`,
      {
        component: {
          type,
          model: {
            name: 'location',
            value: values[0],
            fieldset: { legend: { text: 'Location' } },
            items: values.map((value, index) => ({
              id: `location-${index}`,
              name: `location__${index}`,
              label: `Coordinate ${index}`,
              value
            }))
          }
        }
      }
    )
    // Only replace the renderer here; the browser scenario exercises createMap and its plugins.
    const createMap = vi.mocked(map.createMap).mockReturnValue({ map: { on: vi.fn() }, interactPlugin: {} })
    processLocation(CONFIG, document.querySelector('.app-location-field'), 0)
    expect(createMap).toHaveBeenCalledTimes(1)
    const [id, initialConfig] = createMap.mock.calls[0]
    expect(id).toBe('map_0')
    expect(initialConfig.zoom).toBe('16')
    expect(initialConfig.center[0]).toBeCloseTo(-0.1283539, 5)
    expect(initialConfig.center[1]).toBeCloseTo(51.5039908, 5)
    expect(initialConfig.markers).toEqual([{ id: 'location', coords: initialConfig.center }])
    expect([...document.querySelectorAll('input')].map((input) => input.value)).toEqual(values)
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
