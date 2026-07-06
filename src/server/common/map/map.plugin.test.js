// @ts-nocheck
import { vi } from 'vitest'
import { mapPlugin } from './map.plugin.js'

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  fetchParcels: vi.fn(),
  fetchParcelTileLocation: vi.fn()
}))

vi.mock('~/src/server/common/helpers/auth/backend-auth-helper.js', () => ({
  createApiHeadersForLandGrantsBackend: vi.fn().mockReturnValue({ Authorization: 'Bearer test' })
}))

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn((key) => (key === 'mapMockDataEnabled' ? false : 'https://land-grants-api'))
  }
}))

vi.mock('~/src/server/common/map/map.mock.js', () => ({
  isMockData: vi.fn().mockReturnValue(false),
  buildMockFeatures: vi.fn()
}))

vi.mock('~/src/server/land-grants/utils/format-parcel.js', () => ({
  stringifyParcel: vi.fn((p) => `${p.sheetId}-${p.parcelId}`)
}))

import { fetchParcels, fetchParcelTileLocation } from '~/src/server/land-grants/services/land-grants.service.js'
import { isMockData, buildMockFeatures } from '~/src/server/common/map/map.mock.js'
import { resetOsBasemapCache } from './map.plugin.js'

const mockParcels = [
  { sheetId: 'SD7148', parcelId: '9160', area: { value: 2.5 } },
  { sheetId: 'SD7148', parcelId: '9161', area: { value: null } }
]

function makeServer() {
  const routes = []
  return {
    route: vi.fn((r) => routes.push(r)),
    _routes: routes
  }
}

function makeRequest(yarData = {}) {
  const store = { ...yarData }
  return {
    auth: { credentials: { sbi: '123456789' } },
    yar: {
      get: vi.fn((key) => store[key]),
      set: vi.fn((key, val) => {
        store[key] = val
      })
    },
    params: {}
  }
}

function makeH() {
  const responseObj = {
    code: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis()
  }
  return {
    response: vi.fn().mockReturnValue(responseObj),
    _responseObj: responseObj
  }
}

function makeOsRequest(path = '') {
  return {
    auth: { credentials: { sbi: '123456789' } },
    server: { info: { protocol: 'http' } },
    info: { host: 'localhost:3000' },
    params: { path },
    query: {}
  }
}

const OS_STYLE_JSON = {
  sources: {
    esri: {
      url: 'https://api.os.uk/maps/vector/v1/vts/resources/styles/root.json',
      type: 'vector'
    }
  },
  glyphs: 'https://api.os.uk/maps/vector/v1/vts/resources/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://api.os.uk/maps/vector/v1/vts/resources/sprites/sprite',
  layers: []
}

const OS_TILEJSON = {
  tiles: ['https://api.os.uk/maps/vector/v1/vts/{z}/{x}/{y}.pbf']
}

describe('mapPlugin', () => {
  let server
  let parcelsHandler
  let geojsonHandler
  let tilesHandler
  let osBasemapHandler
  let osTilesHandler

  beforeEach(() => {
    resetOsBasemapCache()
    server = makeServer()
    mapPlugin.plugin.register(server)
    parcelsHandler = server._routes[0].handler
    geojsonHandler = server._routes[1].handler
    tilesHandler = server._routes[2].handler
    osBasemapHandler = server._routes[3].handler
    osTilesHandler = server._routes[4].handler
    vi.clearAllMocks()
  })

  describe('GET /api/map/parcels', () => {
    it('returns features and bbox on success', async () => {
      fetchParcels.mockResolvedValue(mockParcels)
      fetchParcelTileLocation.mockResolvedValue({ minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 })
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      expect(h.response).toHaveBeenCalledWith(
        expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({ id: 'SD7148-9160' }),
            expect.objectContaining({ id: 'SD7148-9161' })
          ]),
          bbox: { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 }
        })
      )
      const [payload] = h.response.mock.calls[0]
      expect(payload).not.toHaveProperty('tileUrl')
    })

    it('maps areaHa to null when area value is null', async () => {
      fetchParcels.mockResolvedValue([{ sheetId: 'SD7148', parcelId: '9161', area: { value: null } }])
      fetchParcelTileLocation.mockResolvedValue(null)
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      const [{ features }] = h.response.mock.calls[0]
      expect(features[0].properties.areaHa).toBeNull()
    })

    it('does not store parcel IDs in session', async () => {
      fetchParcels.mockResolvedValue(mockParcels)
      fetchParcelTileLocation.mockResolvedValue(null)
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      expect(request.yar.set).not.toHaveBeenCalledWith('mapParcelIds', expect.anything())
    })

    it('does not include tileUrl when no parcels returned', async () => {
      fetchParcels.mockResolvedValue([])
      fetchParcelTileLocation.mockResolvedValue(null)
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      const [payload] = h.response.mock.calls[0]
      expect(payload).not.toHaveProperty('tileUrl')
    })

    it('returns 503 with error message when fetchParcels throws without a status code', async () => {
      fetchParcels.mockRejectedValue(new Error('backend down'))
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      expect(h.response).toHaveBeenCalledWith({ error: 'backend down' })
      expect(h._responseObj.code).toHaveBeenCalledWith(503)
    })

    it('passes through upstream 5xx status when fetchParcels throws with one', async () => {
      const error = Object.assign(new Error('internal server error'), { code: 500 })
      fetchParcels.mockRejectedValue(error)
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      expect(h.response).toHaveBeenCalledWith({ error: 'internal server error' })
      expect(h._responseObj.code).toHaveBeenCalledWith(500)
    })

    it('passes through upstream 4xx status when fetchParcels throws with one', async () => {
      const error = Object.assign(new Error('Land parcels not found'), { code: 404 })
      fetchParcels.mockRejectedValue(error)
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      expect(h.response).toHaveBeenCalledWith({ error: 'Land parcels not found' })
      expect(h._responseObj.code).toHaveBeenCalledWith(404)
    })

    it('passes through upstream 403 status when fetchParcels throws with one', async () => {
      const error = Object.assign(new Error('Forbidden'), { status: 403 })
      fetchParcels.mockRejectedValue(error)
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      expect(h.response).toHaveBeenCalledWith({ error: 'Forbidden' })
      expect(h._responseObj.code).toHaveBeenCalledWith(403)
    })

    it('continues with null bbox when fetchParcelTileLocation returns null', async () => {
      fetchParcels.mockResolvedValue(mockParcels)
      fetchParcelTileLocation.mockResolvedValue(null)
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      const [{ bbox }] = h.response.mock.calls[0]
      expect(bbox).toBeNull()
    })

    it('returns mock geojson response when mock mode is enabled', async () => {
      isMockData.mockReturnValue(true)
      buildMockFeatures.mockReturnValue({
        features: [{ type: 'Feature', id: 'SD7148-9160', geometry: {}, properties: {} }],
        bbox: { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 }
      })
      fetchParcels.mockResolvedValue(mockParcels)
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      expect(request.yar.set).toHaveBeenCalledWith('mapMockFeatures', expect.any(Array))
      expect(h.response).toHaveBeenCalledWith(expect.objectContaining({ mock: true }))
    })
  })

  describe('GET /api/map/parcels/geojson', () => {
    it('returns 404 when mock mode is disabled', async () => {
      isMockData.mockReturnValue(false)
      const request = makeRequest()
      const h = makeH()

      geojsonHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(404)
    })

    it('returns 404 when mock mode is enabled but no features in session', async () => {
      isMockData.mockReturnValue(true)
      const request = makeRequest({})
      const h = makeH()

      geojsonHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(404)
    })

    it('returns GeoJSON feature collection from session', async () => {
      isMockData.mockReturnValue(true)
      const features = [{ type: 'Feature', id: 'SD7148-9160' }]
      const request = makeRequest({ mapMockFeatures: features })
      const h = makeH()

      geojsonHandler(request, h)

      expect(h.response).toHaveBeenCalledWith({ type: 'FeatureCollection', features })
      expect(h._responseObj.code).toHaveBeenCalledWith(200)
    })
  })

  describe('GET /api/map/parcel-tiles/{z}/{x}/{y}', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn()
    })

    it('has Joi integer validation on z, x, y params', () => {
      const tilesRoute = server._routes[2]
      const schema = tilesRoute.options.validate.params
      expect(schema.validate({ z: 12, x: 100, y: 200 }).error).toBeUndefined()
      expect(schema.validate({ z: -1, x: 0, y: 0 }).error).toBeDefined()
      expect(schema.validate({ z: 1.5, x: 0, y: 0 }).error).toBeDefined()
      expect(schema.validate({ z: 'abc', x: 0, y: 0 }).error).toBeDefined()
    })

    it('proxies the tile request with parcel IDs from fetchParcels', async () => {
      fetchParcels.mockResolvedValue([{ sheetId: 'SD7148', parcelId: '9160' }])
      global.fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
      })
      const request = makeRequest()
      request.params = { z: '12', x: '100', y: '200' }
      const h = makeH()

      await tilesHandler(request, h)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://land-grants-api/api/v1/parcel-tiles/12/100/200',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ parcelIds: ['SD7148-9160'] })
        })
      )
      expect(h._responseObj.type).toHaveBeenCalledWith('application/x-protobuf')
    })

    it('returns upstream status code when tile fetch fails', async () => {
      fetchParcels.mockResolvedValue([{ sheetId: 'SD7148', parcelId: '9160' }])
      global.fetch.mockResolvedValue({ ok: false, status: 404 })
      const request = makeRequest()
      request.params = { z: '12', x: '100', y: '200' }
      const h = makeH()

      await tilesHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(404)
    })

    it('returns 503 when fetchParcels throws', async () => {
      fetchParcels.mockRejectedValue(new Error('network error'))
      const request = makeRequest()
      request.params = { z: '12', x: '100', y: '200' }
      const h = makeH()

      await tilesHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(503)
    })

    it('returns 503 when tile fetch throws', async () => {
      fetchParcels.mockResolvedValue([])
      global.fetch.mockRejectedValue(new Error('network error'))
      const request = makeRequest()
      request.params = { z: '10', x: '50', y: '60' }
      const h = makeH()

      await tilesHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(503)
    })

    it('uses empty parcel IDs when fetchParcels returns none', async () => {
      fetchParcels.mockResolvedValue([])
      global.fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0))
      })
      const request = makeRequest()
      request.params = { z: '10', x: '50', y: '60' }
      const h = makeH()

      await tilesHandler(request, h)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: JSON.stringify({ parcelIds: [] }) })
      )
    })
  })

  describe('GET /api/map/os-basemap', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn()
    })

    it('returns proxied style JSON on success', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(OS_STYLE_JSON) })
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(OS_TILEJSON) })
      const request = makeOsRequest()
      const h = makeH()

      await osBasemapHandler(request, h)

      expect(h.response).toHaveBeenCalledWith(expect.objectContaining({ layers: [] }))
      expect(h._responseObj.code).toHaveBeenCalledWith(200)
      expect(h._responseObj.type).toHaveBeenCalledWith('application/json')
    })

    it('rewrites OS tile URL to proxy path in returned style', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(OS_STYLE_JSON) })
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(OS_TILEJSON) })
      const request = makeOsRequest()
      const h = makeH()

      await osBasemapHandler(request, h)

      const [style] = h.response.mock.calls[0]
      expect(style.glyphs).toMatch(/^http:\/\/localhost:3000\/api\/map\/os-tiles/)
      expect(style.sprite).toMatch(/^http:\/\/localhost:3000\/api\/map\/os-tiles/)
    })

    it('uses per-request origin when cache already populated', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(OS_STYLE_JSON) })
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(OS_TILEJSON) })

      // First request populates cache
      await osBasemapHandler(makeOsRequest(), makeH())

      // Second request — different host — should use its own origin in tile URL
      const h2 = makeH()
      const req2 = { ...makeOsRequest(), info: { host: 'other-host:9000' } }
      await osBasemapHandler(req2, h2)

      const [style] = h2.response.mock.calls[0]
      expect(style.glyphs).toMatch(/^http:\/\/other-host:9000\/api\/map\/os-tiles/)
      // Only one pair of upstream fetches total (cache hit on second call)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('returns 503 when OS fetch throws', async () => {
      global.fetch.mockRejectedValue(new Error('network'))
      const request = makeOsRequest()
      const h = makeH()

      await osBasemapHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(503)
    })

    it('returns upstream status when style fetch is not ok', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(OS_TILEJSON) })
      const request = makeOsRequest()
      const h = makeH()

      await osBasemapHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(401)
    })

    it('returns upstream status when tilejson fetch is not ok', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(OS_STYLE_JSON) })
        .mockResolvedValueOnce({ ok: false, status: 403 })
      const request = makeOsRequest()
      const h = makeH()

      await osBasemapHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(403)
    })

    it('leaves non-OS sources unchanged in returned style', async () => {
      const styleWithNonOsSource = {
        ...OS_STYLE_JSON,
        sources: {
          esri: { url: 'https://api.os.uk/maps/vector/v1/vts/root.json', type: 'vector' },
          other: { url: 'https://example.com/tiles.json', type: 'vector' }
        }
      }
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(styleWithNonOsSource) })
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(OS_TILEJSON) })
      const request = makeOsRequest()
      const h = makeH()

      await osBasemapHandler(request, h)

      const [style] = h.response.mock.calls[0]
      expect(style.sources.other.url).toBe('https://example.com/tiles.json')
    })

    it('returns 503 when tilejson has no tiles array', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(OS_STYLE_JSON) })
        .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({}) })
      const request = makeOsRequest()
      const h = makeH()

      await osBasemapHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(503)
    })
  })

  describe('GET /api/map/os-tiles/{path*}', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn()
    })

    it('proxies request and returns buffer with content-type', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/x-protobuf') },
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4))
      })
      const request = makeOsRequest('12/100/200.pbf')
      const h = makeH()

      await osTilesHandler(request, h)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.os.uk/maps/vector/v1/vts/12/100/200.pbf')
      )
      expect(h._responseObj.type).toHaveBeenCalledWith('application/x-protobuf')
      expect(h._responseObj.code).toHaveBeenCalledWith(200)
    })

    it('injects API key and srs into upstream URL', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0))
      })
      const request = makeOsRequest('')
      const h = makeH()

      await osTilesHandler(request, h)

      const [url] = global.fetch.mock.calls[0]
      expect(url).toContain('key=')
      expect(url).toContain('srs=3857')
    })

    it('returns upstream status when not ok', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 404 })
      const request = makeOsRequest('missing/path')
      const h = makeH()

      await osTilesHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(404)
    })

    it('returns 503 when fetch throws', async () => {
      global.fetch.mockRejectedValue(new Error('network'))
      const request = makeOsRequest('12/100/200.pbf')
      const h = makeH()

      await osTilesHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(503)
    })
  })
})
