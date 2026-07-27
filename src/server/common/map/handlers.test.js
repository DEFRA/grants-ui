// @ts-nocheck
import { vi } from 'vitest'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'mapTileCacheMaxAgeSeconds') {
        return 3600
      }
      if (key === 'baseUrl') {
        return ''
      }
      if (key === 'osMapsApiKey') {
        return 'test-os-key'
      }
      if (key === 'osMapsBaseUrl') {
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

vi.mock('~/src/server/land-grants/services/land-grants.client.js', () => ({
  fetchParcelTile: vi.fn()
}))

vi.mock('~/src/server/common/map/mvt-compound-id.js', () => ({
  withCompoundParcelIds: vi.fn((buf) => buf)
}))

vi.mock('~/src/server/common/map/map.mock.js', () => ({
  isMockData: vi.fn().mockReturnValue(false)
}))

vi.mock('~/src/server/common/map/map.mock.plugin.js', () => ({
  buildMockParcelsResponse: vi.fn()
}))

vi.mock('~/src/shared/format-parcel.js', () => ({
  stringifyParcel: vi.fn((p) => `${p.sheetId}-${p.parcelId}`)
}))

import { parcelsHandler, tilesHandler, osBasemapHandler, osTileProxyHandler } from './handlers.js'
import { config } from '~/src/config/config.js'
import { fetchParcels, fetchParcelTileLocation } from '~/src/server/land-grants/services/land-grants.service.js'
import { fetchParcelTile } from '~/src/server/land-grants/services/land-grants.client.js'
import { withCompoundParcelIds } from '~/src/server/common/map/mvt-compound-id.js'
import { isMockData } from '~/src/server/common/map/map.mock.js'
import { buildMockParcelsResponse } from '~/src/server/common/map/map.mock.plugin.js'
import { mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

const makeH = () => mockHapiResponseToolkit({ bytes: vi.fn().mockReturnThis() })

function makeRequest(params = {}) {
  return {
    auth: { credentials: { token: 'defra-id-access-token', sbi: '123456789' } },
    params,
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
    isMockData.mockReturnValue(false)
  })

  it('returns features and bbox on success', async () => {
    fetchParcels.mockResolvedValue(mockParcels)
    fetchParcelTileLocation.mockResolvedValue({ minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 })
    const h = makeH()

    const request = makeRequest()
    await parcelsHandler(request, h)

    expect(fetchParcels).toHaveBeenCalledWith(request, expectedUserContext)
    expect(fetchParcelTileLocation).toHaveBeenCalledWith(['SD7148-9160', 'SD7148-9161'], expectedUserContext)
    const [payload] = h.response.mock.calls[0]
    expect(payload.features).toEqual([
      expect.objectContaining({ id: 'SD7148-9160' }),
      expect.objectContaining({ id: 'SD7148-9161' })
    ])
    expect(payload.bbox).toEqual({ minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 })
    expect(payload).not.toHaveProperty('tileUrl')
  })

  it('maps areaHa to null when area value is null', async () => {
    fetchParcels.mockResolvedValue([{ sheetId: 'SD7148', parcelId: '9161', area: { value: null } }])
    fetchParcelTileLocation.mockResolvedValue(null)
    const h = makeH()

    await parcelsHandler(makeRequest(), h)

    const [{ features }] = h.response.mock.calls[0]
    expect(features[0].properties.areaHa).toBeNull()
  })

  it('continues with null bbox when fetchParcelTileLocation returns null', async () => {
    fetchParcels.mockResolvedValue(mockParcels)
    fetchParcelTileLocation.mockResolvedValue(null)
    const h = makeH()

    await parcelsHandler(makeRequest(), h)

    const [{ bbox }] = h.response.mock.calls[0]
    expect(bbox).toBeNull()
  })

  it('never writes to the session on the production path', async () => {
    fetchParcels.mockResolvedValue(mockParcels)
    fetchParcelTileLocation.mockResolvedValue(null)
    const request = makeRequest()

    await parcelsHandler(request, makeH())

    expect(request.yar.set).not.toHaveBeenCalled()
    expect(buildMockParcelsResponse).not.toHaveBeenCalled()
  })

  it('delegates to the mock response builder in mock mode', async () => {
    isMockData.mockReturnValue(true)
    fetchParcels.mockResolvedValue(mockParcels)
    const sentinel = Symbol('mock-response')
    buildMockParcelsResponse.mockReturnValue(sentinel)
    const request = makeRequest()
    const h = makeH()

    const result = await parcelsHandler(request, h)

    expect(buildMockParcelsResponse).toHaveBeenCalledWith(
      request,
      expect.arrayContaining([expect.objectContaining({ id: 'SD7148-9160' })]),
      h
    )
    expect(fetchParcelTileLocation).not.toHaveBeenCalled()
    expect(result).toBe(sentinel)
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

  it('marks tiles as privately cacheable', async () => {
    fetchParcels.mockResolvedValue([])
    fetchParcelTile.mockResolvedValue(Buffer.alloc(0))
    const h = makeH()

    await tilesHandler(makeRequest({ z: '10', x: '50', y: '60' }), h)

    expect(h.header).toHaveBeenCalledWith('Cache-Control', 'private, max-age=3600')
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
