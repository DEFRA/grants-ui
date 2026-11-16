// @vitest-environment jsdom
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
const ZERO_COORDINATE_CASES = [
  { type: 'latlongfield', values: ['51.5074', '0'], center: [0, POINT.lat] },
  { type: 'eastingnorthingfield', values: ['0', '180000'], center: CENTER },
  { type: 'eastingnorthingfield', values: ['530000', '0'], center: CENTER },
  { type: 'eastingnorthingfield', values: ['0', '0'], center: CENTER }
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
  values.forEach((value, index) => {
    const input = document.createElement('input')
    input.className = 'govuk-input'
    const parts = type === 'latlongfield' ? ['latitude', 'longitude'] : ['easting', 'northing']
    input.name = type === 'osgridreffield' ? 'location' : `location__${parts[index]}`
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
    window.dispatchEvent(new window.Event('pagehide'))
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.useRealTimers()
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
    expect([...field.querySelectorAll('input.govuk-input')].map((input) => input.value)).toEqual(values)
    expect(field.querySelector('.app-approximate-location')).toBeNull()
    expect(field.querySelector('input[type="hidden"]')).toBeNull()
  })

  test.each([
    ...CASES.map(({ type, values }) => ({ type, values: values.map(() => '') })),
    { type: 'latlongfield', values: ['invalid', '-0.1276'] },
    { type: 'latlongfield', values: ['51.5074', ''] },
    { type: 'latlongfield', values: ['51.5074', '   '] },
    { type: 'latlongfield', values: ['51.5074', 'invalid'] },
    { type: 'latlongfield', values: ['0', '-0.1276'] },
    { type: 'latlongfield', values: ['61', '-0.1276'] },
    { type: 'latlongfield', values: ['51.5074', '-14'] },
    { type: 'eastingnorthingfield', values: ['', '180000'] },
    { type: 'eastingnorthingfield', values: ['530000', '   '] },
    { type: 'eastingnorthingfield', values: ['invalid', '180000'] },
    { type: 'eastingnorthingfield', values: ['530000', 'Infinity'] },
    { type: 'eastingnorthingfield', values: ['-1', '180000'] },
    { type: 'eastingnorthingfield', values: ['700001', '180000'] },
    { type: 'eastingnorthingfield', values: ['530000', '1300001'] },
    { type: 'osgridreffield', values: ['not a grid reference'] },
    { type: 'osgridreffield', values: ['SI 4178 2432'] },
    { type: 'osgridreffield', values: ['TA 417 2432'] }
  ])('uses the supplied default view for invalid or empty $type answers ($values)', ({ type, values }) => {
    processLocation(CONFIG, addField(type, values), 0)
    expect(map.createMap).toHaveBeenCalledWith('map_0', map.defaultConfig, CONFIG)
  })

  test.each(ZERO_COORDINATE_CASES)('centres $type on saved zero coordinates ($values)', ({ type, values, center }) => {
    processLocation(CONFIG, addField(type, values), 0)
    expect(map.createMap).toHaveBeenCalledWith(
      'map_0',
      { center, zoom: '16', markers: [{ id: 'location', coords: center }] },
      CONFIG
    )
    if (type === 'eastingnorthingfield') {
      expect(map.eastingNorthingToLatLong).toHaveBeenCalledWith({
        easting: Number(values[0]),
        northing: Number(values[1])
      })
    }
  })

  test.each(ZERO_COORDINATE_CASES)(
    'centres $type when changed to zero coordinates ($values)',
    ({ type, values, center }) => {
      const field = addField(
        type,
        values.map(() => '')
      )
      processLocation(CONFIG, field, 0)
      const provider = {}
      handlers.get(map.EVENTS.mapReady)({ map: provider })
      const inputs = [...field.querySelectorAll('input.govuk-input')]
      inputs.forEach((input, index) => {
        input.value = values[index]
      })
      inputs[1].dispatchEvent(new window.Event('change'))
      expect(map.centerMap).toHaveBeenCalledWith(instance, provider, center)
    }
  )

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
    expect(instance.addPanel).not.toHaveBeenCalled()
    expect(interactPlugin.enable).toHaveBeenCalledTimes(1)
    const inputs = [...field.querySelectorAll('input.govuk-input')]
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

  test.each([undefined, {}, { hideMapHelpPanel: true }])(
    'does not create the help panel when hidden (%j)',
    (options) => {
      processLocation(CONFIG, addField('latlongfield', ['', '']), 0, options)
      handlers.get(map.EVENTS.mapReady)({ map: {} })
      expect(instance.addPanel).not.toHaveBeenCalled()
      expect(interactPlugin.enable).toHaveBeenCalledTimes(1)
    }
  )

  test('creates the help panel when the component opts in', () => {
    processLocation(CONFIG, addField('latlongfield', ['', '']), 0, { hideMapHelpPanel: false })
    handlers.get(map.EVENTS.mapReady)({ map: {} })
    expect(instance.addPanel).toHaveBeenCalledWith(
      'info',
      expect.objectContaining({ label: 'How to use the map', desktop: expect.objectContaining({ open: true }) })
    )
    expect(interactPlugin.enable).toHaveBeenCalledTimes(1)
  })

  test.each(CASES)('looks up a saved $type answer when approximate locations are enabled', async ({ type, values }) => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ label: 'London' }) }))
    const field = addField(type, values)
    processLocation(CONFIG, field, 0, { showApproximateLocation: true })
    handlers.get(map.EVENTS.mapReady)({ map: {} })
    await vi.advanceTimersByTimeAsync(300)
    expect(field.querySelector('.app-approximate-location').textContent).toBe('Approximate location: London')
    expect([...field.querySelectorAll('input.govuk-input')].map((input) => input.value)).toEqual(values)
    const metadata = field.querySelector('input[type="hidden"]')
    expect(metadata.name).toBe('__mapLocationHint__location')
    expect(JSON.parse(metadata.value)).toEqual({
      text: 'Approximate location: London',
      answer: Object.fromEntries(
        [...field.querySelectorAll('input.govuk-input')].map((input) => [input.name, input.value])
      )
    })
  })

  test.each(CASES)('does not label a saved $type answer until the map is ready', async ({ type, values }) => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ label: 'London' }) }))
    const field = addField(type, values)
    processLocation(CONFIG, field, 0, { showApproximateLocation: true })
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).not.toHaveBeenCalled()
    expect(field.querySelector('.app-approximate-location').textContent).toBe('')
    expect(field.querySelector('input[type="hidden"]').value).toBe('')
  })

  test('clears hidden metadata while typing and submits only a hint for the current answer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ label: 'London, UK' }) }))
    document.body.innerHTML = '<form></form>'
    const field = addField('latlongfield', ['51.5074', '-0.1276'])
    document.querySelector('form').append(field)
    processLocation(CONFIG, field, 0, { showApproximateLocation: true, approximateLocationPrefix: 'Nearby:' })
    handlers.get(map.EVENTS.mapReady)({ map: {} })
    await vi.advanceTimersByTimeAsync(300)
    const metadata = field.querySelector('input[type="hidden"]')
    expect(JSON.parse(new window.FormData(document.querySelector('form')).get(metadata.name))).toEqual({
      text: 'Nearby: London, UK',
      answer: { location__latitude: '51.5074', location__longitude: '-0.1276' }
    })
    const latitude = field.querySelector('input.govuk-input')
    latitude.value = '51.6'
    latitude.dispatchEvent(new window.Event('input'))
    expect(metadata.value).toBe('')
    await vi.advanceTimersByTimeAsync(300)
    expect(JSON.parse(metadata.value).answer.location__latitude).toBe('51.6')
    latitude.value = ''
    latitude.dispatchEvent(new window.Event('input'))
    expect(metadata.value).toBe('')
  })

  test.each(CASES)('refreshes the $type label for coordinate edits and marker placement', async ({ type, values }) => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ label: 'London' }) }))
    const field = addField(
      type,
      values.map(() => '')
    )
    processLocation(CONFIG, field, 0, { showApproximateLocation: true })
    handlers.get(map.EVENTS.mapReady)({ map: {} })
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).not.toHaveBeenCalled()
    const inputs = [...field.querySelectorAll('input.govuk-input')]
    inputs.forEach((input, index) => {
      input.value = values[index]
    })
    inputs[0].dispatchEvent(new window.Event('change'))
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).toHaveBeenCalledTimes(1)
    handlers.get(map.EVENTS.interactMarkerChange)({ coords: CENTER })
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(field.querySelector('.app-approximate-location').textContent).toContain('London')
    inputs[0].value = ''
    inputs[0].dispatchEvent(new window.Event('change'))
    expect(field.querySelector('.app-approximate-location').textContent).toBe('')
    expect(instance.on.mock.calls.map(([event]) => event)).toEqual(['map:ready', 'interact:markerchange'])
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
