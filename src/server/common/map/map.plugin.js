import { config } from '~/src/config/config.js'
import { error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { ROUTES } from './map-routes.js'
import { osTileParams, parcelTileParams } from './tile-params.js'
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
      // Surface a missing OS key at startup
      if (!config.get('osMapsApiKey')) {
        error(LogCodes.SYSTEM.OS_MAPS_API_KEY_MISSING, {})
      }

      server.route({
        method: 'GET',
        path: ROUTES.parcels,
        options: sessionAuth,
        handler: parcelsHandler
      })
      server.route({
        method: 'GET',
        path: ROUTES.parcelTiles,
        options: { ...sessionAuth, validate: parcelTileParams },
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
        options: { ...sessionAuth, validate: osTileParams },
        handler: osTileProxyHandler
      })
    }
  }
}
