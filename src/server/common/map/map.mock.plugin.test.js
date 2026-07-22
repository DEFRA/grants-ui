// @ts-nocheck
import { vi } from 'vitest'

vi.mock('~/src/server/common/map/map.mock.js', () => ({
  buildMockFeatures: vi.fn()
}))

import { mapMockPlugin, buildMockParcelsResponse } from './map.mock.plugin.js'
import { ROUTES } from './map-routes.js'
import { buildMockFeatures } from '~/src/server/common/map/map.mock.js'
import { mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

function makeServer() {
  const routes = []
  return { route: vi.fn((r) => routes.push(r)), _routes: routes }
}

function makeRequest(yarData = {}) {
  const store = { ...yarData }
  return {
    yar: {
      get: vi.fn((key) => store[key]),
      set: vi.fn((key, val) => {
        store[key] = val
      })
    }
  }
}

const makeH = () => mockHapiResponseToolkit()

describe('mapMockPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers only the geojson route with session auth', () => {
    const server = makeServer()
    mapMockPlugin.plugin.register(server)

    expect(server._routes).toHaveLength(1)
    expect(server._routes[0].path).toBe(ROUTES.parcelsMockGeojson)
    expect(server._routes[0].options.auth).toEqual({ mode: 'required', strategy: 'session' })
  })

  describe('geojson handler', () => {
    let handler

    beforeEach(() => {
      const server = makeServer()
      mapMockPlugin.plugin.register(server)
      handler = server._routes[0].handler
    })

    it('returns 404 when no features are in the session', () => {
      const h = makeH()
      handler(makeRequest({}), h)
      expect(h.code).toHaveBeenCalledWith(404)
    })

    it('returns the stored FeatureCollection', () => {
      const features = [{ type: 'Feature', id: 'SD7148-9160' }]
      const h = makeH()
      handler(makeRequest({ mapMockFeatures: features }), h)
      expect(h.response).toHaveBeenCalledWith({ type: 'FeatureCollection', features })
      expect(h.code).toHaveBeenCalledWith(200)
    })
  })

  describe('buildMockParcelsResponse', () => {
    it('stashes features in the session and flags mock: true', () => {
      buildMockFeatures.mockReturnValue({
        features: [{ type: 'Feature', id: 'SD7148-9160' }],
        bbox: { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 }
      })
      const request = makeRequest()
      const h = makeH()
      const parcelData = [{ id: 'SD7148-9160', sheetId: 'SD7148', parcelId: '9160', areaHa: 2.5 }]

      buildMockParcelsResponse(request, parcelData, h)

      expect(buildMockFeatures).toHaveBeenCalledWith(parcelData)
      expect(request.yar.set).toHaveBeenCalledWith('mapMockFeatures', expect.any(Array))
      expect(h.response).toHaveBeenCalledWith(expect.objectContaining({ mock: true }))
      expect(h.code).toHaveBeenCalledWith(200)
    })
  })
})
