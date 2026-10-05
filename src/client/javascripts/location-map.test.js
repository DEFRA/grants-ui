import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { map } from '@defra/forms-engine-plugin/shared.js'
import { processLocation } from './location-map.js'

vi.mock('@defra/forms-engine-plugin/shared.js', () => ({
  map: {
    defaultConfig: { center: [-2.421975, 53.825564], zoom: '6' },
    EVENTS: { mapReady: 'map:ready', interactMarkerChange: 'interact:markerchange' },
    createMap: vi.fn(),
    centerMap: vi.fn(),
    eastingNorthingToLatLong: vi.fn(),
    osGridRefToLatLong: vi.fn(),
    latLongToEastingNorthing: vi.fn(),
    latLongToOsGridRef: vi.fn()
  }
}))

const CONFIG = { apiPath: '/api', assetPath: '/public/assets' }
const POINT = { lat: 51.5074, long: -0.1276 }
const CENTER = [POINT.long, POINT.lat]
const CASES = [
  { type: 'latlongfield', values: ['51.5074', '-0.1276'], written: ['51.5074000', '-0.1276000'] },
  { type: 'eastingnorthingfield', values: ['530000', '180000'], written: ['530000', '180000'] },
  { type: 'osgridreffield', values: ['SP 4178 2432'], written: ['SP 4178 2432'] }
]
const handlers = new Map()
const instance = { on: vi.fn(), addPanel: vi.fn() }
const interactPlugin = { enable: vi.fn() }

function addField(type, values) {
  const field = document.createElement('div')
  field.className = 'app-location-field'
  field.dataset.locationtype = type
  const inputs = document.createElement('div')
  inputs.className = 'app-location-field-inputs'
  values.forEach((value) => {
    const input = document.createElement('input')
    input.className = 'govuk-input'
    input.value = value
    inputs.append(input)
  })
  field.append(inputs)
  document.body.append(field)
  return field
}

describe('location map adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    instance.on.mockImplementation((event, handler) => handlers.set(event, handler))
    vi.mocked(map.createMap).mockReturnValue({ map: instance, interactPlugin })
    vi.mocked(map.eastingNorthingToLatLong).mockReturnValue(POINT)
    vi.mocked(map.osGridRefToLatLong).mockReturnValue(POINT)
    vi.mocked(map.latLongToEastingNorthing).mockReturnValue({ easting: 530000.4, northing: 180000.4 })
    vi.mocked(map.latLongToOsGridRef).mockReturnValue('SP 4178 2432')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  test.each(CASES)('centres $type on a saved answer and retains the native index', ({ type, values }) => {
    const field = addField(type, values)
    processLocation(CONFIG, field, 3)
    expect(map.createMap).toHaveBeenCalledWith(
      'map_3',
      { center: CENTER, zoom: '16', markers: [{ id: 'location', coords: CENTER }] },
      CONFIG
    )
    expect(field.querySelector('.app-location-field-inputs').nextElementSibling.id).toBe('map_3')
    expect([...field.querySelectorAll('input')].map((input) => input.value)).toEqual(values)
  })

  test.each([
    ...CASES.map(({ type, values }) => ({ type, values: values.map(() => '') })),
    { type: 'latlongfield', values: ['invalid', '-0.1276'] },
    { type: 'latlongfield', values: ['51.5074', '0'] },
    { type: 'latlongfield', values: ['61', '-0.1276'] },
    { type: 'latlongfield', values: ['51.5074', '-14'] },
    { type: 'eastingnorthingfield', values: ['-1', '180000'] },
    { type: 'eastingnorthingfield', values: ['700001', '180000'] },
    { type: 'eastingnorthingfield', values: ['530000', '1300001'] },
    { type: 'eastingnorthingfield', values: ['530000', '0'] },
    { type: 'osgridreffield', values: ['not a grid reference'] },
    { type: 'osgridreffield', values: ['SI 4178 2432'] },
    { type: 'osgridreffield', values: ['TA 417 2432'] }
  ])('uses the supplied default view for invalid or empty $type answers ($values)', ({ type, values }) => {
    processLocation(CONFIG, addField(type, values), 0)
    expect(map.createMap).toHaveBeenCalledWith('map_0', map.defaultConfig, CONFIG)
  })

  test.each(['sp41782432', 'SP417 243', 'SP 41782 24321', 'HL 4178 2432', 'JM 4178 2432'])(
    'accepts supported grid reference formats (%s)',
    (value) => {
      processLocation(CONFIG, addField('osgridreffield', [value]), 0)
      expect(map.osGridRefToLatLong).toHaveBeenCalledWith(value)
      expect(map.createMap).toHaveBeenCalledWith('map_0', expect.objectContaining({ center: CENTER }), CONFIG)
    }
  )

  test.each(CASES)('binds $type input changes and marker placement when ready', ({ type, values, written }) => {
    const field = addField(
      type,
      values.map(() => '')
    )
    processLocation(CONFIG, field, 0)
    const provider = {}
    handlers.get(map.EVENTS.mapReady)({ map: provider })
    expect(instance.addPanel).toHaveBeenCalledWith('info', expect.objectContaining({ label: 'How to use the map' }))
    expect(interactPlugin.enable).toHaveBeenCalledTimes(1)
    const inputs = [...field.querySelectorAll('input')]
    inputs[0].dispatchEvent(new window.Event('change'))
    expect(map.centerMap).not.toHaveBeenCalled()
    inputs.forEach((input, index) => {
      input.value = values[index]
    })
    inputs.forEach((input) => input.dispatchEvent(new window.Event('change')))
    expect(map.centerMap).toHaveBeenCalledTimes(inputs.length)
    expect(map.centerMap).toHaveBeenCalledWith(instance, provider, CENTER)
    handlers.get(map.EVENTS.interactMarkerChange)({ coords: CENTER })
    expect(inputs.map((input) => input.value)).toEqual(written)
  })

  test('skips unsupported fields and missing input containers', () => {
    processLocation(CONFIG, document.createElement('span'), 0)
    processLocation(CONFIG, document.createElement('div'), 0)
    processLocation(CONFIG, addField('nationalgridfieldnumberfield', ['']), 0)
    expect(map.createMap).not.toHaveBeenCalled()
  })

  test.each(CASES)('rejects an unexpected input count for $type', ({ type }) => {
    expect(() => processLocation(CONFIG, addField(type, []), 0)).toThrow('Expected')
    expect(map.createMap).not.toHaveBeenCalled()
  })
})
