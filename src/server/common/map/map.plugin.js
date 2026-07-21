import { ROUTES, tileParamsValidation } from './map-routes.js'
import { parcelsHandler, tilesHandler, osBasemapHandler, osTileProxyHandler } from './handlers.js'

const sessionAuth = { auth: { mode: 'required', strategy: 'session' } }

/**
 * Map routes: parcels metadata, per-user vector tiles, and the OS raster
 * basemap (style + key-injecting tile proxy). The mock-only geojson route lives
 * in map.mock.plugin.js, registered only when mock mode is on.
 */
export const mapPlugin = {
  plugin: {
    name: 'map',
    register(server) {
      server.route({
        method: 'GET',
        path: ROUTES.parcels,
        options: sessionAuth,
        handler: parcelsHandler
      })
      server.route({
        method: 'GET',
        path: ROUTES.parcelTiles,
        options: { ...sessionAuth, validate: tileParamsValidation },
        handler: tilesHandler
      })
      server.route({
        method: 'GET',
        path: ROUTES.osBasemap,
        options: sessionAuth,
        handler: osBasemapHandler
      })
      server.route({
        method: 'GET',
        path: ROUTES.osTiles,
        options: { ...sessionAuth, validate: tileParamsValidation },
        handler: osTileProxyHandler
      })
    }
  }
}
