import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { buildMockFeatures } from './map.mock.js'
import { ROUTES } from './map-routes.js'

const sessionAuth = { auth: { mode: 'required', strategy: 'session' } }

/**
 * Mock-mode parcels response. Embeds real polygon geometry (via buildMockFeatures)
 * and stashes the FeatureCollection in the session so the geojson route below can
 * serve it, then flags `mock: true` so the client reads geometry from that route
 * instead of the vector-tile route.
 *
 * Lives here, not in the production parcels handler, so the yar.set write and the
 * 173KB-sourced geometry can never execute on a real code path — the whole plugin
 * is registered only when `isMockData()`.
 * @param {Request} request
 * @param {{ id: string, sheetId: string, parcelId: string, areaHa: number | null }[]} parcelData
 * @param {ResponseToolkit} h
 */
export function buildMockParcelsResponse(request, parcelData, h) {
  const mockResult = buildMockFeatures(parcelData)
  request.yar.set('mapMockFeatures', mockResult.features)
  return h
    .response({
      features: mockResult.features,
      bbox: mockResult.bbox,
      mock: true
    })
    .code(statusCodes.ok)
}

/**
 * Serves the full GeoJSON FeatureCollection (with polygon geometry) that
 * buildMockParcelsResponse stashed in the session, so local dev works without a
 * running tile server. The plugin is only registered in mock mode, so in
 * production the router itself 404s this path — no handler-level guard needed.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
function mockGeojsonHandler(request, h) {
  const features = /** @type {ParcelFeature[] | null} */ (request.yar.get('mapMockFeatures'))
  if (!features) {
    return h.response({ error: 'not found' }).code(statusCodes.notFound)
  }
  return h.response({ type: 'FeatureCollection', features }).code(statusCodes.ok)
}

export const mapMockPlugin = {
  plugin: {
    name: 'map-mock',
    register(server) {
      server.route({
        method: 'GET',
        path: ROUTES.parcelsMockGeojson,
        options: sessionAuth,
        handler: mockGeojsonHandler
      })
    }
  }
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 * @import { ParcelFeature } from './types.js'
 */
