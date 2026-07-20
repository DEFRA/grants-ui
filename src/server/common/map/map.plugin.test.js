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
      return 'https://land-grants-api'
    })
  }
}))

import { mapPlugin } from './map.plugin.js'
import { ROUTES } from './map-routes.js'

function makeServer() {
  const routes = []
  return {
    route: vi.fn((r) => routes.push(r)),
    _routes: routes
  }
}

describe('mapPlugin route registration', () => {
  let server

  beforeEach(() => {
    server = makeServer()
    mapPlugin.plugin.register(server)
  })

  it('registers exactly the four production routes', () => {
    expect(server._routes.map((r) => r.path)).toEqual([
      ROUTES.parcels,
      ROUTES.parcelTiles,
      ROUTES.osBasemap,
      ROUTES.osTiles
    ])
  })

  it('does not register the mock-only geojson route', () => {
    expect(server._routes.map((r) => r.path)).not.toContain(ROUTES.parcelsMockGeojson)
  })

  it('requires session auth on every route', () => {
    for (const route of server._routes) {
      expect(route.options.auth).toEqual({ mode: 'required', strategy: 'session' })
    }
  })

  it('validates tile params on both tile routes and nowhere else', () => {
    const byPath = Object.fromEntries(server._routes.map((r) => [r.path, r]))
    expect(byPath[ROUTES.parcelTiles].options.validate).toBeDefined()
    expect(byPath[ROUTES.osTiles].options.validate).toBeDefined()
    expect(byPath[ROUTES.parcels].options.validate).toBeUndefined()
    expect(byPath[ROUTES.osBasemap].options.validate).toBeUndefined()
  })

  it('applies integer tile-param validation on the tile routes', () => {
    const schema = server._routes.find((r) => r.path === ROUTES.osTiles).options.validate.params
    expect(schema.validate({ z: 12, x: 100, y: 200 }).error).toBeUndefined()
    expect(schema.validate({ z: -1, x: 0, y: 0 }).error).toBeDefined()
    expect(schema.validate({ z: 1.5, x: 0, y: 0 }).error).toBeDefined()
    expect(schema.validate({ z: 'abc', x: 0, y: 0 }).error).toBeDefined()
  })
})
