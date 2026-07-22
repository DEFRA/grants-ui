// @ts-nocheck
import { vi } from 'vitest'

const { defaultConfigGet } = vi.hoisted(() => ({
  defaultConfigGet: (/** @type {string} */ key) =>
    key === 'mapTileCacheMaxAgeSeconds' ? 3600 : key === 'baseUrl' ? '' : 'https://land-grants-api'
}))
vi.mock('~/src/config/config.js', () => ({ config: { get: vi.fn(defaultConfigGet) } }))

const mockError = vi.fn()
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  error: (...args) => mockError(...args),
  LogCodes: { SYSTEM: { OS_MAPS_API_KEY_MISSING: { level: 'error', messageFunc: () => 'missing key' } } }
}))

import { config } from '~/src/config/config.js'
import { mapPlugin } from './map.plugin.js'
import { ROUTES } from './map-routes.js'
import { osTileParams, parcelTileParams } from './tile-params.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log.js'

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
    mockError.mockClear()
    config.get.mockImplementation(defaultConfigGet)
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

  it('wires the matching tile-param schema onto each tile route and nowhere else', () => {
    const byPath = Object.fromEntries(server._routes.map((r) => [r.path, r]))
    expect(byPath[ROUTES.osTiles].options.validate).toBe(osTileParams)
    expect(byPath[ROUTES.parcelTiles].options.validate).toBe(parcelTileParams)
    expect(byPath[ROUTES.parcels].options.validate).toBeUndefined()
    expect(byPath[ROUTES.osBasemap].options.validate).toBeUndefined()
  })

  it('logs a startup error when the OS Maps API key is not set', () => {
    config.get.mockImplementation((key) => (key === 'osMapsApiKey' ? '' : 'x'))

    mapPlugin.plugin.register(makeServer())

    expect(mockError).toHaveBeenCalledWith(LogCodes.SYSTEM.OS_MAPS_API_KEY_MISSING, {})
  })

  it('does not log when the OS Maps API key is present', () => {
    expect(mockError).not.toHaveBeenCalled()
  })
})
