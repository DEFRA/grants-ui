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

describe('mapPlugin', () => {
  let server
  let parcelsHandler
  let geojsonHandler
  let tilesHandler

  beforeEach(() => {
    server = makeServer()
    mapPlugin.plugin.register(server)
    parcelsHandler = server._routes[0].handler
    geojsonHandler = server._routes[1].handler
    tilesHandler = server._routes[2].handler
    vi.clearAllMocks()
  })

  describe('GET /api/map/parcels', () => {
    it('returns features, bbox and tileUrl on success', async () => {
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
          bbox: { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 },
          tileUrl: '/land-grants/parcel-tiles/{z}/{x}/{y}'
        })
      )
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

    it('stores parcel IDs in session', async () => {
      fetchParcels.mockResolvedValue(mockParcels)
      fetchParcelTileLocation.mockResolvedValue(null)
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      expect(request.yar.set).toHaveBeenCalledWith('mapParcelIds', ['SD7148-9160', 'SD7148-9161'])
    })

    it('sets tileUrl to null when no parcels returned', async () => {
      fetchParcels.mockResolvedValue([])
      fetchParcelTileLocation.mockResolvedValue(null)
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      const [{ tileUrl }] = h.response.mock.calls[0]
      expect(tileUrl).toBeNull()
    })

    it('returns 503 when fetchParcels throws', async () => {
      fetchParcels.mockRejectedValue(new Error('backend down'))
      const request = makeRequest()
      const h = makeH()

      await parcelsHandler(request, h)

      expect(h.response).toHaveBeenCalledWith({ error: 'unavailable' })
      expect(h._responseObj.code).toHaveBeenCalledWith(503)
    })

    it('continues with null bbox when fetchParcelTileLocation fails', async () => {
      fetchParcels.mockResolvedValue(mockParcels)
      fetchParcelTileLocation.mockRejectedValue(new Error('timeout'))
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
      expect(h.response).toHaveBeenCalledWith(
        expect.objectContaining({ tileUrl: null, geojsonUrl: '/api/map/parcels/geojson' })
      )
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

  describe('GET /land-grants/parcel-tiles/{z}/{x}/{y}', () => {
    it('has Joi integer validation on z, x, y params', () => {
      const tilesRoute = server._routes[2]
      const schema = tilesRoute.options.validate.params
      expect(schema.validate({ z: 12, x: 100, y: 200 }).error).toBeUndefined()
      expect(schema.validate({ z: -1, x: 0, y: 0 }).error).toBeDefined()
      expect(schema.validate({ z: 1.5, x: 0, y: 0 }).error).toBeDefined()
      expect(schema.validate({ z: 'abc', x: 0, y: 0 }).error).toBeDefined()
    })

    beforeEach(() => {
      global.fetch = vi.fn()
    })

    it('proxies the tile request with parcel IDs from session', async () => {
      const mockResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
      }
      global.fetch.mockResolvedValue(mockResponse)
      const request = makeRequest({ mapParcelIds: ['SD7148-9160'] })
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
      global.fetch.mockResolvedValue({ ok: false, status: 404 })
      const request = makeRequest({ mapParcelIds: [] })
      request.params = { z: '12', x: '100', y: '200' }
      const h = makeH()

      await tilesHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(404)
    })

    it('returns 503 when fetch throws', async () => {
      global.fetch.mockRejectedValue(new Error('network error'))
      const request = makeRequest({ mapParcelIds: ['SD7148-9160'] })
      request.params = { z: '12', x: '100', y: '200' }
      const h = makeH()

      await tilesHandler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(503)
    })

    it('uses empty parcel IDs when session has none', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0))
      })
      const request = makeRequest({})
      request.params = { z: '10', x: '50', y: '60' }
      const h = makeH()

      await tilesHandler(request, h)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: JSON.stringify({ parcelIds: [] }) })
      )
    })
  })
})
