// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { geospatialMap, map } from '@defra/forms-engine-plugin/shared.js'
import { processLocation } from './location-map.js'
import { initialiseComponentMaps } from './component-maps.js'

vi.hoisted(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})

vi.mock('@defra/forms-engine-plugin/shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    geospatialMap: { ...actual.geospatialMap, processGeospatial: vi.fn() },
    map: {
      ...actual.map,
      defaultConfig: { center: [-2.421975, 53.825564], zoom: '6' },
      eastingNorthingToLatLong: vi.fn(),
      osGridRefToLatLong: vi.fn(),
      formSubmitFactory: vi.fn(() => vi.fn())
    }
  }
})
vi.mock('./location-map.js', async (importOriginal) => ({
  ...(await importOriginal()),
  processLocation: vi.fn()
}))

const UK_VIEW = { center: [-2.421975, 53.825564], zoom: '6' }
const initialViews = []
const initialUrl = window.location.href
const gazetteerEntry = (name = 'SW1A 1AA', type = 'Postcode', coordinates = {}) => ({
  GAZETTEER_ENTRY: { NAME1: name, LOCAL_TYPE: type, GEOMETRY_X: 530000, GEOMETRY_Y: 180000, ...coordinates }
})
const response = (results) => ({ ok: true, json: vi.fn().mockResolvedValue({ results }) })

function addPostcode(postcode) {
  const settings = document.createElement('div')
  settings.id = 'component-map-settings'
  settings.dataset.mapPostcode = postcode
  document.body.append(settings)
}

function addOptions(name, options) {
  if (!document.getElementById('component-map-settings')) {
    addPostcode('')
  }
  const settings = document.createElement('div')
  settings.dataset.mapComponent = name
  Object.assign(settings.dataset, options)
  document.getElementById('component-map-settings').append(settings)
}

function addHelpPanel(field, mapId = 'map_0', panelId = 'info') {
  const panel = document.createElement('div')
  panel.id = `${mapId}-panel-${panelId}`
  panel.className = 'im-c-panel'
  const button = document.createElement('button')
  button.className = 'im-c-panel__close'
  const close = vi.fn(() => {
    panel.hidden = true
  })
  button.addEventListener('click', close)
  panel.append(button)
  field.append(panel)
  return { panel, close }
}

describe('forms component maps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initialViews.length = 0
    const captureView = () => initialViews.push({ ...map.defaultConfig })
    vi.mocked(processLocation).mockImplementation(captureView)
    vi.mocked(geospatialMap.processGeospatial).mockImplementation(captureView)
    Object.assign(map.defaultConfig, UK_VIEW)
    window.componentMapsEnabled = true
    document.body.innerHTML =
      '<div class="app-location-field" data-locationtype="osgridreffield"><input name="location" value="" /></div>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([gazetteerEntry()])))
    vi.mocked(map.eastingNorthingToLatLong).mockReturnValue({ lat: 51.5074, long: -0.1276 })
    vi.mocked(map.osGridRefToLatLong).mockReturnValue({ lat: 51.5074, long: -0.1276 })
  })

  afterEach(() => {
    window.dispatchEvent(new window.Event('pagehide'))
    document.body.innerHTML = ''
    window.history.replaceState(null, '', initialUrl)
    delete window.componentMapsEnabled
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test.each([false, undefined])('does not initialise disabled maps (%s)', async (enabled) => {
    window.componentMapsEnabled = enabled
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(fetch).not.toHaveBeenCalled()
    expect(processLocation).not.toHaveBeenCalled()
    expect(geospatialMap.processGeospatial).not.toHaveBeenCalled()
  })

  test('does not look up the postcode on pages without supported maps', async () => {
    document.body.innerHTML = '<div class="app-location-field" data-locationtype="nationalgridfieldnumberfield"></div>'
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(fetch).not.toHaveBeenCalled()
    expect(processLocation).not.toHaveBeenCalled()
    expect(geospatialMap.processGeospatial).not.toHaveBeenCalled()
  })

  test.each([undefined, '', '   '])('uses the UK view when the postcode is missing or blank (%s)', async (postcode) => {
    if (postcode !== undefined) {
      addPostcode(postcode)
    }
    await initialiseComponentMaps()
    expect(fetch).not.toHaveBeenCalled()
    expect(map.defaultConfig).toEqual(UK_VIEW)
    expect(processLocation).toHaveBeenCalledWith(
      { apiPath: '/api', assetPath: '/public/assets' },
      document.querySelector('.app-location-field'),
      0,
      { hideMapHelpPanel: true, zoomToPostcode: true }
    )
    expect(initialViews).toEqual([UK_VIEW])
  })

  test.each(['osgridreffield', 'eastingnorthingfield', 'latlongfield', 'geospatial'])(
    'centres a %s map on a uniquely matched postcode without changing the answer',
    async (type) => {
      document.body.innerHTML =
        type === 'geospatial'
          ? '<div class="app-geospatial-field"><textarea></textarea></div>'
          : `<div class="app-location-field" data-locationtype="${type}"><input value="" /></div>`
      addPostcode(' SW1A 1AA ')
      await initialiseComponentMaps()
      expect(fetch).toHaveBeenCalledWith('/api/geocode-proxy?query=SW1A%201AA', {
        signal: expect.any(window.AbortSignal)
      })
      expect(map.eastingNorthingToLatLong).toHaveBeenCalledWith({ easting: 530000, northing: 180000 })
      expect(initialViews).toEqual([{ center: [-0.1276, 51.5074], zoom: 10 }])
      expect(map.defaultConfig).toEqual(UK_VIEW)
      expect(document.querySelector('input, textarea').value).toBe('')
      expect(type === 'geospatial' ? geospatialMap.processGeospatial : processLocation).toHaveBeenCalledTimes(1)
    }
  )

  test('preserves an existing answer and saved view query parameters', async () => {
    const input = document.querySelector('input')
    input.value = 'SP 4178 2432'
    const previousUrl = window.location.href
    window.history.replaceState(null, '', '?map_0:center=-1.5,53&map_0:zoom=14')
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(fetch).not.toHaveBeenCalled()
    expect(input.value).toBe('SP 4178 2432')
    expect(window.location.search).toBe('?map_0:center=-1.5,53&map_0:zoom=14')
    window.history.replaceState(null, '', previousUrl)
  })

  test.each([
    { type: 'osgridreffield', values: ['SP 4178 2432'] },
    { type: 'eastingnorthingfield', values: ['530000', '180000'] },
    { type: 'eastingnorthingfield', values: ['0', '0'] },
    { type: 'latlongfield', values: ['51.5074', '-0.1276'] },
    { type: 'latlongfield', values: ['51.5074', '0'] }
  ])('skips the postcode lookup for a usable $type answer ($values)', async ({ type, values }) => {
    document.body.innerHTML = `<div class="app-location-field" data-locationtype="${type}">
      ${values.map((value) => `<input class="govuk-input" value="${value}" />`).join('')}
    </div>`
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(fetch).not.toHaveBeenCalled()
    expect(processLocation).toHaveBeenCalledTimes(1)
    expect([...document.querySelectorAll('input')].map((input) => input.value)).toEqual(values)
  })

  test.each([
    { type: 'osgridreffield', values: ['not a grid reference'] },
    { type: 'eastingnorthingfield', values: ['530000', ''] },
    { type: 'latlongfield', values: ['51.5074', ''] },
    { type: 'latlongfield', values: ['61', '-0.1276'] }
  ])('looks up the postcode for an unusable $type answer ($values)', async ({ type, values }) => {
    document.body.innerHTML = `<div class="app-location-field" data-locationtype="${type}">
      ${values.map((value) => `<input class="govuk-input" value="${value}" />`).join('')}
    </div>`
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(initialViews).toEqual([{ center: [-0.1276, 51.5074], zoom: 10 }])
  })

  test('skips the postcode lookup for saved geospatial features', async () => {
    document.body.innerHTML = '<div class="app-geospatial-field"><textarea class="govuk-textarea"></textarea></div>'
    const input = document.querySelector('textarea')
    const value = JSON.stringify([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1276, 51.5074] }, properties: {} }
    ])
    input.value = value
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(fetch).not.toHaveBeenCalled()
    expect(geospatialMap.processGeospatial).toHaveBeenCalledTimes(1)
    expect(input.value).toBe(value)
  })

  test.each(['', '   ', '[]', 'invalid JSON', '[{"type":"Feature","geometry":null}]'])(
    'looks up the postcode when geospatial data supplies no usable bounds (%s)',
    async (value) => {
      document.body.innerHTML = '<div class="app-geospatial-field"><textarea class="govuk-textarea"></textarea></div>'
      document.querySelector('textarea').value = value
      addPostcode('SW1A 1AA')
      await initialiseComponentMaps()
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(initialViews).toEqual([{ center: [-0.1276, 51.5074], zoom: 10 }])
    }
  )

  test.each([
    { markup: '<div class="app-location-field" data-locationtype="osgridreffield"><input /></div>', id: 'map_0' },
    { markup: '<div class="app-geospatial-field"><textarea></textarea></div>', id: 'geospatialmap_0' }
  ])('skips the postcode lookup for a saved $id URL view without an answer', async ({ markup, id }) => {
    document.body.innerHTML = markup
    window.history.replaceState(null, '', `?${id}:center=-1.5,53&${id}:zoom=14`)
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(fetch).not.toHaveBeenCalled()
    expect(initialViews).toEqual([UK_VIEW])
    expect(window.location.search).toBe(`?${id}:center=-1.5,53&${id}:zoom=14`)
  })

  test('uses only an exact postcode match, ignoring fuzzy matches and other result types', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response([
        gazetteerEntry('SW1A 1AB'),
        gazetteerEntry('SW1A 1AA', 'City'),
        gazetteerEntry('SW1A 1AA'),
        gazetteerEntry('SW1A 1AA', 'Named_Road')
      ])
    )
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(initialViews[0].center).toEqual([-0.1276, 51.5074])
  })

  test.each([
    { input: 'sw1a 1aa', resultName: 'SW1A 1AA', query: 'SW1A%201AA' },
    { input: ' SW1A   1AA ', resultName: 'sw1a1aa', query: 'SW1A%201AA' },
    { input: 'sw1a1aa', resultName: 'SW1A 1AA', query: 'SW1A1AA' },
    { input: 'SW1A\t1AA', resultName: ' sw1a  1aa ', query: 'SW1A%201AA' }
  ])('matches postcodes regardless of case and whitespace ($input)', async ({ input, resultName, query }) => {
    vi.mocked(fetch).mockResolvedValue(response([gazetteerEntry(resultName)]))
    addPostcode(input)
    await initialiseComponentMaps()
    expect(initialViews).toEqual([{ center: [-0.1276, 51.5074], zoom: 10 }])
    expect(fetch).toHaveBeenCalledWith(`/api/geocode-proxy?query=${query}`, expect.any(Object))
  })

  test.each([
    { results: [] },
    { results: [gazetteerEntry('SW1A 1AB')] },
    { results: [gazetteerEntry('SW1A 1AA', 'Named_Road')] },
    { results: [gazetteerEntry(), gazetteerEntry()] },
    { results: [gazetteerEntry('SW1A 1AA', 'City'), gazetteerEntry('SW1A 1AA', 'Town')] },
    { results: [gazetteerEntry('SW1A 1AA', 'Postcode', { GEOMETRY_X: null })] },
    { results: [gazetteerEntry('SW1A 1AA', 'Postcode', { GEOMETRY_X: '530000' })] },
    { results: [gazetteerEntry('SW1A 1AA', 'Postcode', { GEOMETRY_Y: 1400000 })] },
    { results: [gazetteerEntry('SW1A 1AA', 'Postcode', { GEOMETRY_X: -1 })] },
    { results: [gazetteerEntry('SW1A 1AA', 'Postcode', { GEOMETRY_X: 700001 })] },
    { results: [gazetteerEntry('SW1A 1AA', 'Postcode', { GEOMETRY_Y: -1 })] },
    { results: [null, {}] },
    { results: [{ GAZETTEER_ENTRY: { LOCAL_TYPE: 'Postcode' } }] }
  ])('retains the UK view for unsuitable or ambiguous results ($results)', async ({ results }) => {
    vi.mocked(fetch).mockResolvedValue(response(results))
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(map.defaultConfig).toEqual(UK_VIEW)
    expect(map.eastingNorthingToLatLong).not.toHaveBeenCalled()
    expect(processLocation).toHaveBeenCalledTimes(1)
    expect(initialViews).toEqual([UK_VIEW])
  })

  test('does not fall back to a town or city result when no postcode matches', async () => {
    vi.mocked(fetch).mockResolvedValue(response([gazetteerEntry('SW1A 1AA', 'Town')]))
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(initialViews).toEqual([UK_VIEW])
    expect(map.eastingNorthingToLatLong).not.toHaveBeenCalled()
  })

  test.each(['network', 'http', 'json', 'conversion'])(
    'initialises the UK view after a %s failure',
    async (failure) => {
      if (failure === 'network') {
        vi.mocked(fetch).mockRejectedValue(new Error('Network failure'))
      } else if (failure === 'http') {
        vi.mocked(fetch).mockResolvedValue({ ok: false })
      } else if (failure === 'json') {
        vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new Error('Invalid JSON')) })
      } else {
        vi.mocked(map.eastingNorthingToLatLong).mockImplementationOnce(() => {
          throw new Error('Invalid coordinates')
        })
      }
      addPostcode('SW1A 1AA')
      await initialiseComponentMaps()
      expect(map.defaultConfig).toEqual(UK_VIEW)
      expect(processLocation).toHaveBeenCalledTimes(1)
      expect(initialViews).toEqual([UK_VIEW])
    }
  )

  test('aborts a slow lookup after two seconds and still initialises the map', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('Aborted')))
        })
    )
    addPostcode('SW1A 1AA')
    const initialisation = initialiseComponentMaps()
    await vi.advanceTimersByTimeAsync(2000)
    await initialisation
    expect(map.defaultConfig).toEqual(UK_VIEW)
    expect(processLocation).toHaveBeenCalledTimes(1)
    expect(initialViews).toEqual([UK_VIEW])
  })

  test('encodes spaces and special characters in postcode queries safely', async () => {
    addPostcode('SW1A & 1AA')
    await initialiseComponentMaps()
    expect(fetch).toHaveBeenCalledWith('/api/geocode-proxy?query=SW1A%20%26%201AA', expect.any(Object))
  })

  test('does not use a city as a fallback when postcode state is absent', async () => {
    addPostcode('')
    document.getElementById('component-map-settings').dataset.mapCity = 'London'
    await initialiseComponentMaps()
    expect(fetch).not.toHaveBeenCalled()
    expect(initialViews).toEqual([UK_VIEW])
  })

  test('retains the UK view when coordinate conversion returns a non-finite value', async () => {
    vi.mocked(map.eastingNorthingToLatLong).mockReturnValue({ lat: NaN, long: -0.1276 })
    addPostcode('SW1A 1AA')
    await initialiseComponentMaps()
    expect(initialViews).toEqual([UK_VIEW])
  })

  test('closes only the initial geospatial help panel, including delayed rendering', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="app-geospatial-field"></div>')
    await initialiseComponentMaps()
    const fields = document.querySelectorAll('.app-location-field, .app-geospatial-field')
    const unrelated = addHelpPanel(fields[1], 'geospatialmap_0', 'search')
    const locationPanel = addHelpPanel(fields[0])
    const second = addHelpPanel(fields[1], 'geospatialmap_0')
    await vi.waitFor(() => expect(second.close).toHaveBeenCalledTimes(1))
    expect(unrelated.close).not.toHaveBeenCalled()
    expect(locationPanel.close).not.toHaveBeenCalled()
    second.panel.hidden = false
    second.panel.append(document.createElement('span'))
    await Promise.resolve()
    expect(second.close).toHaveBeenCalledTimes(1)
  })

  test('keeps the opted-out component help panel open while still centring on the postcode', async () => {
    addPostcode('SW1A 1AA')
    addOptions('location', { hideMapHelpPanel: 'false' })
    document.body.insertAdjacentHTML('beforeend', '<div class="app-geospatial-field"></div>')
    await initialiseComponentMaps()
    expect(processLocation).toHaveBeenCalledWith(
      { apiPath: '/api', assetPath: '/public/assets' },
      document.querySelector('.app-location-field'),
      0,
      { hideMapHelpPanel: false, zoomToPostcode: true }
    )
    const fields = document.querySelectorAll('.app-location-field, .app-geospatial-field')
    const first = addHelpPanel(fields[0])
    const second = addHelpPanel(fields[1], 'geospatialmap_0')
    await vi.waitFor(() => expect(second.close).toHaveBeenCalledTimes(1))
    expect(first.close).not.toHaveBeenCalled()
    expect(first.panel.hidden).toBe(false)
    expect(second.panel.hidden).toBe(true)
    expect(initialViews).toEqual([
      { center: [-0.1276, 51.5074], zoom: 10 },
      { center: [-0.1276, 51.5074], zoom: 10 }
    ])
  })

  test.each(['true', 'false'])(
    'passes the location help panel setting directly to the adapter (%s)',
    async (setting) => {
      addPostcode('')
      addOptions('location', { hideMapHelpPanel: setting })
      await initialiseComponentMaps()
      expect(processLocation).toHaveBeenCalledWith(
        { apiPath: '/api', assetPath: '/public/assets' },
        document.querySelector('.app-location-field'),
        0,
        { hideMapHelpPanel: setting === 'true', zoomToPostcode: true }
      )
    }
  )

  test('keeps the opted-out geospatial help panel open', async () => {
    document.body.innerHTML = '<div class="app-geospatial-field"><textarea name="boundary"></textarea></div>'
    addOptions('boundary', { hideMapHelpPanel: 'false' })
    await initialiseComponentMaps()
    const { panel, close } = addHelpPanel(document.querySelector('.app-geospatial-field'), 'geospatialmap_0')
    await Promise.resolve()
    expect(close).not.toHaveBeenCalled()
    expect(panel.hidden).toBe(false)
  })

  test('waits for the help panel to open before closing it', async () => {
    document.body.innerHTML = '<div class="app-geospatial-field"></div>'
    const field = document.querySelector('.app-geospatial-field')
    const { panel, close } = addHelpPanel(field, 'geospatialmap_0')
    panel.hidden = true
    await initialiseComponentMaps()
    expect(close).not.toHaveBeenCalled()
    panel.hidden = false
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  })

  test('disconnects pending help observers when leaving the page', async () => {
    document.body.innerHTML = '<div class="app-geospatial-field"></div>'
    await initialiseComponentMaps()
    window.dispatchEvent(new window.Event('pagehide'))
    const { close } = addHelpPanel(document.querySelector('.app-geospatial-field'), 'geospatialmap_0')
    await Promise.resolve()
    expect(close).not.toHaveBeenCalled()
  })

  test('skips the postcode lookup when every component opts out but still hides location help', async () => {
    addPostcode('SW1A 1AA')
    addOptions('location', { zoomToPostcode: 'false' })
    await initialiseComponentMaps()
    expect(fetch).not.toHaveBeenCalled()
    expect(initialViews).toEqual([UK_VIEW])
    expect(processLocation.mock.calls[0][3]).toEqual({ hideMapHelpPanel: true, zoomToPostcode: false })
  })

  test('applies independent views to maps on the same page and preserves native map indices', async () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<div class="app-location-field" data-locationtype="nationalgridfieldnumberfield"></div>'
    )
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="app-location-field" data-locationtype="latlongfield"><input name="coordinates__latitude" /></div>' +
        '<div class="app-geospatial-field"><textarea name="boundary"></textarea></div>'
    )
    addPostcode('SW1A 1AA')
    addOptions('coordinates', { zoomToPostcode: 'false', hideMapHelpPanel: 'false' })
    addOptions('boundary', { zoomToPostcode: 'false' })
    await initialiseComponentMaps()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(initialViews).toEqual([{ center: [-0.1276, 51.5074], zoom: 10 }, UK_VIEW, UK_VIEW])
    expect(processLocation.mock.calls.map((call) => call[2])).toEqual([1, 2])
    expect(processLocation.mock.calls.map((call) => call[3])).toEqual([
      { hideMapHelpPanel: true, zoomToPostcode: true },
      { hideMapHelpPanel: false, zoomToPostcode: false }
    ])
    expect(geospatialMap.processGeospatial.mock.calls[0][2]).toBe(0)
    const fields = document.querySelectorAll('.app-location-field, .app-geospatial-field')
    const ukPanel = addHelpPanel(fields[3], 'geospatialmap_0')
    await vi.waitFor(() => expect(ukPanel.close).toHaveBeenCalledTimes(1))
  })

  test('installs the engine submit handler only once per form with mixed map types', async () => {
    document.body.innerHTML =
      '<form><div class="app-location-field" data-locationtype="osgridreffield"><input name="location" /></div>' +
      '<div class="app-geospatial-field"><textarea name="boundary"></textarea></div>' +
      '<button type="submit">Continue</button><button>Save</button></form>'
    await initialiseComponentMaps()
    expect(map.formSubmitFactory).toHaveBeenCalledTimes(1)
    expect(map.formSubmitFactory).toHaveBeenCalledWith([...document.querySelectorAll('button')])
    const submit = new window.Event('submit')
    document.querySelector('form').dispatchEvent(submit)
    expect(map.formSubmitFactory.mock.results[0].value).toHaveBeenCalledWith(submit)
  })

  test('restores the shared default even if a map fails to initialise', async () => {
    addPostcode('SW1A 1AA')
    vi.mocked(processLocation).mockImplementationOnce(() => {
      throw new Error('Map failed')
    })
    await expect(initialiseComponentMaps()).rejects.toThrow('Map failed')
    expect(map.defaultConfig).toEqual(UK_VIEW)
  })
})
