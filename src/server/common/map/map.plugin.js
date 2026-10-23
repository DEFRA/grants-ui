import { config } from '~/src/config/config.js'
import { error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { ROUTES } from './map-routes.js'
import { osTileParams, parcelTileParams } from './tile-params.js'
import { parcelsQuery, parcelSearchQuery, parcelBboxParams } from './parcels-query.js'
import {
  parcelsHandler,
  parcelSearchHandler,
  parcelBboxHandler,
  tilesHandler,
  osBasemapHandler,
  osTileProxyHandler
} from './handlers.js'

const sessionAuth = { auth: { mode: 'required', strategy: 'session' } }

/**
 * Map routes: parcels metadata, parcel search and bounding boxes, per-user
 * vector tiles, and the OS raster basemap (style + key-injecting tile proxy).
 */
export const mapPlugin = {
  plugin: {
    name: 'map',
    register(server) {
      // Surface a missing land maps OS key at startup
      if (!config.get('maps.land.apiKey')) {
        error(LogCodes.SYSTEM.LAND_MAPS_API_KEY_MISSING, {})
      }

      server.route({
        method: 'GET',
        path: ROUTES.parcels,
        options: { ...sessionAuth, validate: parcelsQuery },
        handler: parcelsHandler
      })
      server.route({
        method: 'GET',
        path: ROUTES.parcelSearch,
        options: { ...sessionAuth, validate: parcelSearchQuery },
        handler: parcelSearchHandler
      })
      server.route({
        method: 'GET',
        path: ROUTES.parcelBbox,
        options: { ...sessionAuth, validate: parcelBboxParams },
        handler: parcelBboxHandler
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
