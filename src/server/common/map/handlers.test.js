// @ts-nocheck
import { vi } from 'vitest'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'landGrants.enableMapActionCount') {
        return false
      }
      if (key === 'maps.land.tileCacheMaxAgeSeconds') {
        return 3600
      }
      if (key === 'baseUrl') {
        return ''
      }
      if (key === 'maps.land.apiKey') {
        return 'test-os-key'
      }
      if (key === 'maps.land.baseUrl') {
        return 'https://api.os.uk/maps/raster/v1/zxy'
      }
      return 'https://land-grants-api'
    })
  }
}))

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  fetchParcels: vi.fn(),
  fetchParcelTileLocation: vi.fn()
}))

vi.mock('~/src/server/land-grants/services/land-grants.client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchParcelTile: vi.fn(),
  locateParcelTiles: vi.fn()
}))

vi.mock('~/src/server/common/map/mvt-compound-id.js', () => ({
  withCompoundParcelIds: vi.fn((buf) => buf)
}))

vi.mock('~/src/shared/format-parcel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  stringifyParcel: vi.fn((p) => `${p.sheetId}-${p.parcelId}`)
}))

vi.mock('~/src/server/land-grants/services/parcel-cache.js', () => ({
  fetchAuthorisedParcelIds: vi.fn()
}))

vi.mock('~/src/server/land-grants/services/parcel-authorisation.js', () => ({
  getAuthorisedParcel: vi.fn()
}))

import {
  parcelsHandler,
  parcelSearchHandler,
  parcelBboxHandler,
  tilesHandler,
  osBasemapHandler,
  osTileProxyHandler
} from './handlers.js'
import { config } from '~/src/config/config.js'
import { fetchParcels, fetchParcelTileLocation } from '~/src/server/land-grants/services/land-grants.service.js'
import { fetchParcelTile, locateParcelTiles } from '~/src/server/land-grants/services/land-grants.client.js'
import { withCompoundParcelIds } from '~/src/server/common/map/mvt-compound-id.js'
import { fetchAuthorisedParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'
import { getAuthorisedParcel } from '~/src/server/land-grants/services/parcel-authorisation.js'
import { mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

const makeH = () => mockHapiResponseToolkit({ bytes: vi.fn().mockReturnThis() })

function makeRequest(params = {}, query = {}) {
  return {
    auth: { credentials: { token: 'defra-id-access-token', sbi: '123456789' } },
    params,
    query,
    yar: { get: vi.fn(), set: vi.fn() }
  }
}

function makeOsRequest(params = {}) {
  return {
    auth: { credentials: { sbi: '123456789' } },
    server: { info: { protocol: 'http' } },
    info: { host: 'localhost:3000' },
    params
  }
}

const mockParcels = [
  { sheetId: 'SD7148', parcelId: '9160', area: { value: 2.5 } },
  { sheetId: 'SD7148', parcelId: '9161', area: { value: null } }
]
const expectedUserContext = {
  defraIdToken: 'defra-id-access-token',
  sbi: '123456789'
}

describe('parcelsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns features and bbox on success', async () => {
    fetchParcels.mockResolvedValue(mockParcels)
    fetchParcelTileLocation.mockResolvedValue({ minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 })
    const h = makeH()

    const request = makeRequest()
    await parcelsHandler(request, h)

    expect(fetchParcels).toHaveBeenCalledWith(request, expectedUserContext, ['size'])
    expect(fetchParcelTileLocation).toHaveBeenCalledWith(['SD7148-9160', 'SD7148-9161'], expectedUserContext)
    const [payload] = h.response.mock.calls[0]
    expect(payload.features).toEqual([
      expect.objectContaining({ id: 'SD7148-9160' }),
      expect.objectContaining({ id: 'SD7148-9161' })
    ])
    expect(payload.bbox).toEqual({ minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 })
    expect(payload).not.toHaveProperty('tileUrl')
  })

  it('marks the response as never cacheable, so a different signed-in user never sees a stale response', async () => {
    fetchParcels.mockResolvedValue(mockParcels)
    fetchParcelTileLocation.mockResolvedValue(null)
    const h = makeH()

    await parcelsHandler(makeRequest(), h)

    expect(h.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it('maps areaHa to null when area value is null', async () => {
    fetchParcels.mockResolvedValue([{ sheetId: 'SD7148', parcelId: '9161', area: { value: null } }])
    fetchParcelTileLocation.mockResolvedValue(null)
    const h = makeH()

    await parcelsHandler(makeRequest(), h)

    const [{ features }] = h.response.mock.calls[0]
    expect(features[0].properties.areaHa).toBeNull()
  })

  it.each([false, true])('gates bulk action calculations and counts when the flag is %s', async (enabled) => {
    config.get.mockReturnValueOnce(enabled)
    fetchParcels.mockImplementation(async (_request, _userContext, fields = ['size']) => [
      {
        sheetId: 'SD7148',
        parcelId: '9160',
        area: { value: 2.5 },
        actions: fields.includes('actions')
          ? [
              { code: 'CLIG3', isAvailable: true, availability: { value: 0, unit: 'ha' } },
              { code: 'CSAM3', isAvailable: false, availability: { value: 2, unit: 'ha' } },
              { code: 'SCR2', isAvailable: false, availability: { value: 2, unit: 'ha' } },
              { code: 'WBD1', isAvailable: true, availability: { value: null, unit: 'count' } }
            ]
          : []
      }
    ])
    fetchParcelTileLocation.mockResolvedValue(null)
    const request = makeRequest()
    request.query.enabledLandActions = ['CLIG3', 'CSAM3', 'SCR2', 'WBD1']
    const h = makeH()

    await parcelsHandler(request, h)

    expect(fetchParcels).toHaveBeenCalledWith(request, expectedUserContext, enabled ? ['size', 'actions'] : ['size'])

    const [{ features }] = h.response.mock.calls[0]
    expect(features[0].properties.actionCount).toBe(enabled ? 2 : undefined)
  })

  it('continues with null bbox when fetchParcelTileLocation returns null', async () => {
    fetchParcels.mockResolvedValue(mockParcels)
    fetchParcelTileLocation.mockResolvedValue(null)
    const h = makeH()

    await parcelsHandler(makeRequest(), h)

    const [{ bbox }] = h.response.mock.calls[0]
    expect(bbox).toBeNull()
  })

  // Every failure returns the generic body — the raw upstream message must
  // never reach the browser — with the upstream status passed through, or 503.
  it.each([
    ['503 without an upstream status', new Error('backend down'), 503],
    ['upstream code 500', Object.assign(new Error('upstream'), { code: 500 }), 500],
    ['upstream code 404', Object.assign(new Error('upstream'), { code: 404 }), 404],
    ['upstream status 403', Object.assign(new Error('upstream'), { status: 403 }), 403]
  ])('returns a generic error and %s when fetchParcels throws', async (_name, error, status) => {
    fetchParcels.mockRejectedValue(error)
    const h = makeH()

    await parcelsHandler(makeRequest(), h)

    expect(h.response).toHaveBeenCalledWith({ error: 'Unable to load your land parcels' })
    expect(h.code).toHaveBeenCalledWith(status)
  })
})

describe('parcelSearchHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const holding = ['SD7148-9161', 'SD7148-9160', 'SJ0001-0002']

  it('returns the matching ids in alphanumeric order, never cacheable', async () => {
    fetchAuthorisedParcelIds.mockResolvedValue(holding)
    const h = makeH()

    await parcelSearchHandler(makeRequest({}, { q: '7148' }), h)

    expect(h.response).toHaveBeenCalledWith({ parcelIds: ['SD7148-9160', 'SD7148-9161'] })
    expect(h.code).toHaveBeenCalledWith(200)
    expect(h.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it.each(['sd7148 916', 'SD7148-916', 'SD7148916'])('matches %s ignoring case, spaces and hyphens', async (q) => {
    fetchAuthorisedParcelIds.mockResolvedValue(holding)
    const h = makeH()

    await parcelSearchHandler(makeRequest({}, { q }), h)

    expect(h.response).toHaveBeenCalledWith({ parcelIds: ['SD7148-9160', 'SD7148-9161'] })
  })

  it('returns an empty list when nothing matches', async () => {
    fetchAuthorisedParcelIds.mockResolvedValue(holding)
    const h = makeH()

    await parcelSearchHandler(makeRequest({}, { q: 'ZZZ' }), h)

    expect(h.response).toHaveBeenCalledWith({ parcelIds: [] })
  })

  it('matches nothing for a query of only separators, rather than the whole holding', async () => {
    fetchAuthorisedParcelIds.mockResolvedValue(holding)
    const h = makeH()

    await parcelSearchHandler(makeRequest({}, { q: '---' }), h)

    expect(h.response).toHaveBeenCalledWith({ parcelIds: [] })
  })

  it('answers 503 when the holding cannot be loaded', async () => {
    fetchAuthorisedParcelIds.mockResolvedValue(null)
    const h = makeH()

    await parcelSearchHandler(makeRequest({}, { q: 'SD' }), h)

    expect(h.response).toHaveBeenCalledWith({ error: 'Unable to search your land parcels' })
    expect(h.code).toHaveBeenCalledWith(503)
  })
})

describe('parcelBboxHandler', () => {
  const bbox = { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the bbox of a parcel the user holds, never cacheable', async () => {
    const request = makeRequest({ parcelId: 'SD7148-9160' })
    getAuthorisedParcel.mockResolvedValue({ formRequest: request, sheetId: 'SD7148', parcelId: '9160' })
    locateParcelTiles.mockResolvedValue({ bbox })
    const h = makeH()

    await parcelBboxHandler(request, h)

    expect(locateParcelTiles).toHaveBeenCalledWith(['SD7148-9160'], 'https://land-grants-api', expectedUserContext)
    expect(h.response).toHaveBeenCalledWith({ bbox })
    expect(h.code).toHaveBeenCalledWith(200)
    expect(h.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it('answers 403 for a parcel the user does not hold, without calling upstream', async () => {
    getAuthorisedParcel.mockResolvedValue(null)
    const h = makeH()

    await parcelBboxHandler(makeRequest({ parcelId: 'SD7148-9160' }), h)

    expect(locateParcelTiles).not.toHaveBeenCalled()
    expect(h.code).toHaveBeenCalledWith(403)
  })

  it('answers 404 when upstream has no location for the parcel', async () => {
    const request = makeRequest({ parcelId: 'SD7148-9160' })
    getAuthorisedParcel.mockResolvedValue({ formRequest: request, sheetId: 'SD7148', parcelId: '9160' })
    locateParcelTiles.mockResolvedValue({ bbox: null })
    const h = makeH()

    await parcelBboxHandler(request, h)

    expect(h.response).toHaveBeenCalledWith({ error: 'Unable to locate the land parcel' })
    expect(h.code).toHaveBeenCalledWith(404)
  })

  it.each([
    ['passes the upstream status through', Object.assign(new Error('upstream'), { code: 502 }), 502],
    ['answers 503 without an upstream status', new Error('offline'), 503]
  ])('%s when the lookup fails, rather than answering 404', async (_name, error, expected) => {
    const request = makeRequest({ parcelId: 'SD7148-9160' })
    getAuthorisedParcel.mockResolvedValue({ formRequest: request, sheetId: 'SD7148', parcelId: '9160' })
    locateParcelTiles.mockRejectedValue(error)
    const h = makeH()

    await parcelBboxHandler(request, h)

    expect(h.response).toHaveBeenCalledWith({ error: 'Unable to locate the land parcel' })
    expect(h.code).toHaveBeenCalledWith(expected)
  })
})

describe('tilesHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the tile with parcel IDs and returns protobuf', async () => {
    fetchParcels.mockResolvedValue([{ sheetId: 'SD7148', parcelId: '9160' }])
    const buffer = Buffer.from([1, 2, 3])
    fetchParcelTile.mockResolvedValue(buffer)
    const h = makeH()

    await tilesHandler(makeRequest({ z: '12', x: '100', y: '200' }), h)

    expect(fetchParcelTile).toHaveBeenCalledWith(
      ['SD7148-9160'],
      '12',
      '100',
      '200',
      'https://land-grants-api',
      expectedUserContext
    )
    expect(withCompoundParcelIds).toHaveBeenCalledWith(buffer)
    expect(h.type).toHaveBeenCalledWith('application/x-protobuf')
  })

  it('marks tiles as never cacheable, since the URL carries no user-scoping', async () => {
    fetchParcels.mockResolvedValue([])
    fetchParcelTile.mockResolvedValue(Buffer.alloc(0))
    const h = makeH()

    await tilesHandler(makeRequest({ z: '10', x: '50', y: '60' }), h)

    expect(h.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it('passes an empty parcel ID list through when the user has none', async () => {
    fetchParcels.mockResolvedValue([])
    fetchParcelTile.mockResolvedValue(Buffer.alloc(0))
    const h = makeH()

    await tilesHandler(makeRequest({ z: '10', x: '50', y: '60' }), h)

    expect(fetchParcelTile).toHaveBeenCalledWith([], '10', '50', '60', expect.any(String), expectedUserContext)
  })

  it.each([
    ['503 without an upstream status', new Error('network error'), 503],
    ['the upstream status when present', Object.assign(new Error('upstream down'), { code: 500 }), 500]
  ])('returns %s when fetchParcels throws', async (_name, error, status) => {
    fetchParcels.mockRejectedValue(error)
    const h = makeH()

    await tilesHandler(makeRequest({ z: '12', x: '100', y: '200' }), h)

    expect(h.code).toHaveBeenCalledWith(status)
    expect(fetchParcelTile).not.toHaveBeenCalled()
  })

  it.each([
    ['the upstream status when present', Object.assign(new Error('not found'), { code: 404 }), 404],
    ['503 without an upstream status', new Error('network error'), 503]
  ])('returns %s when the tile fetch throws', async (_name, error, status) => {
    fetchParcels.mockResolvedValue([{ sheetId: 'SD7148', parcelId: '9160' }])
    fetchParcelTile.mockRejectedValue(error)
    const h = makeH()

    await tilesHandler(makeRequest({ z: '12', x: '100', y: '200' }), h)

    expect(h.code).toHaveBeenCalledWith(status)
  })
})

describe('osBasemapHandler', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
    vi.clearAllMocks()
  })

  it('builds the raster style locally, with attribution and private caching, calling no upstream', () => {
    const h = makeH()

    osBasemapHandler(makeOsRequest(), h)

    expect(global.fetch).not.toHaveBeenCalled()
    expect(h.code).toHaveBeenCalledWith(200)
    expect(h.type).toHaveBeenCalledWith('application/json')
    expect(h.header).toHaveBeenCalledWith('Cache-Control', 'private, max-age=3600')

    const [style] = h.response.mock.calls[0]
    expect(style.version).toBe(8)
    expect(style.sources['os-raster'].type).toBe('raster')
    expect(style.sources['os-raster'].tiles).toEqual(['http://localhost:3000/api/map/os-tiles/{z}/{x}/{y}'])
    // 16: zooms 17-20 are Premium data on the OS Maps API.
    expect(style.sources['os-raster'].maxzoom).toBe(16)
    expect(style.layers).toEqual([{ id: 'os-basemap', type: 'raster', source: 'os-raster' }])
    expect(style.sources['os-raster'].attribution).toContain('Crown copyright')
    expect(style.sources['os-raster'].attribution).toContain(String(new Date().getFullYear()))
  })

  it('prefers the configured baseUrl over the request origin', () => {
    const defaultImpl = config.get.getMockImplementation()
    config.get.mockImplementation((key) => (key === 'baseUrl' ? 'https://grants-ui.prod.example/' : defaultImpl(key)))
    const h = makeH()

    try {
      osBasemapHandler(makeOsRequest(), h)
    } finally {
      config.get.mockImplementation(defaultImpl)
    }

    const [style] = h.response.mock.calls[0]
    expect(style.sources['os-raster'].tiles[0]).toMatch(/^https:\/\/grants-ui\.prod\.example\/api\/map\/os-tiles/)
  })
})

describe('osTileProxyHandler', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
    vi.clearAllMocks()
  })

  function mockOsTileHeaders(overrides = {}) {
    const values = { 'content-type': 'image/png', 'content-length': '1024', ...overrides }
    return { get: vi.fn((key) => values[key] ?? null) }
  }

  it('proxies to the OS raster endpoint with the server-side layer and key', async () => {
    global.fetch.mockResolvedValue({ ok: true, headers: mockOsTileHeaders(), body: new ReadableStream() })
    const h = makeH()

    await osTileProxyHandler(makeOsRequest({ z: '12', x: '100', y: '200' }), h)

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/12/100/200.png?key=test-os-key'
    )
    expect(h.type).toHaveBeenCalledWith('image/png')
    expect(h.code).toHaveBeenCalledWith(200)
  })

  it('forwards the upstream Content-Length', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      headers: mockOsTileHeaders({ 'content-length': '2048' }),
      body: new ReadableStream()
    })
    const h = makeH()

    await osTileProxyHandler(makeOsRequest({ z: '12', x: '100', y: '200' }), h)

    expect(h.bytes).toHaveBeenCalledWith(2048)
  })

  it('does not call bytes() when upstream sends no Content-Length', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      headers: mockOsTileHeaders({ 'content-length': undefined }),
      body: new ReadableStream()
    })
    const h = makeH()

    await osTileProxyHandler(makeOsRequest({ z: '12', x: '100', y: '200' }), h)

    expect(h.bytes).not.toHaveBeenCalled()
  })

  it('marks tiles as publicly cacheable (same for every user)', async () => {
    global.fetch.mockResolvedValue({ ok: true, headers: mockOsTileHeaders(), body: new ReadableStream() })
    const h = makeH()

    await osTileProxyHandler(makeOsRequest({ z: '7', x: '62', y: '40' }), h)

    expect(h.header).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600')
  })

  it('passes through the upstream status when not ok', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 })
    const h = makeH()

    await osTileProxyHandler(makeOsRequest({ z: '12', x: '100', y: '200' }), h)

    expect(h.code).toHaveBeenCalledWith(401)
  })

  it('returns 503 when fetch throws', async () => {
    global.fetch.mockRejectedValue(new Error('network'))
    const h = makeH()

    await osTileProxyHandler(makeOsRequest({ z: '12', x: '100', y: '200' }), h)

    expect(h.code).toHaveBeenCalledWith(503)
  })

  it('returns 502 when an ok upstream response has a null body', async () => {
    global.fetch.mockResolvedValue({ ok: true, headers: mockOsTileHeaders(), body: null })
    const h = makeH()

    await osTileProxyHandler(makeOsRequest({ z: '12', x: '100', y: '200' }), h)

    expect(h.code).toHaveBeenCalledWith(502)
    expect(h.type).not.toHaveBeenCalled()
  })
})
