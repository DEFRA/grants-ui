import { Readable } from 'node:stream'
import Joi from 'joi'
import { config } from '~/src/config/config.js'
import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { fetchParcels, fetchParcelTileLocation } from '~/src/server/land-grants/services/land-grants.service.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { isMockData, buildMockFeatures } from './map.mock.js'
import { withCompoundParcelIds } from './mvt-compound-id.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')
// OS Maps API (raster ZXY). Deliberately not the OS Vector Tile API, which is
// due to retire in 2028 and is not included in the API keys we are issued.
const OS_MAPS_BASE_URL = 'https://api.os.uk/maps/raster/v1/zxy'
// Basemap style — one of Road_3857 | Outdoor_3857 | Light_3857. The _3857
// suffix is Web Mercator, which MapLibre requires.
const OS_MAPS_LAYER = 'Outdoor_3857'
// The OS raster ZXY service only exists for zooms 7–20; MapLibre overzooms
// beyond maxzoom by stretching the deepest tiles.
const OS_MIN_ZOOM = 7
const OS_MAX_ZOOM = 20
// MapLibre/Mapbox style specification version. This is a protocol constant,
// not a library version — 8 is the only value current MapLibre accepts.
const MAP_STYLE_SPEC_VERSION = 8
// OS ZXY serves 256px tiles. Must be declared: MapLibre's default for raster
// sources is 512, which would render the basemap at the wrong scale.
const OS_TILE_SIZE_PX = 256
const TILE_CACHE_MAX_AGE_SECONDS = 3600
const SERVICE_LAND_GRANTS = 'land-grants-api'
const SERVICE_OS_MAPS = 'os-maps'
const CACHE_CONTROL_HEADER = 'Cache-Control'

/** Everything before the first `?` — OS Maps query strings carry the API key. */
const stripQueryString = (/** @type {string} */ url) => url.split('?')[0]

/**
 * Absolute URL base for URLs the browser will fetch. Prefers the configured
 * base URL because behind the platform's TLS-terminating proxy
 * `server.info.protocol` may be 'http', which would produce mixed-content URLs
 * that the browser blocks on an https page. Falls back to request info for
 * local development where baseUrl is empty.
 * @param {Request} request
 */
function publicOrigin(request) {
  let baseUrl = /** @type {string} */ (config.get('baseUrl'))

  if (!baseUrl) {
    return `${request.server.info.protocol}://${request.info.host}`
  }

  while (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1)
  }

  return baseUrl
}

/**
 * Fetch an upstream URL, logging and returning null when the request itself
 * fails (network error). Non-OK responses are returned for the caller to map
 * to a status code.
 * @param {string} url
 * @param {string} service
 * @param {Request} request
 * @param {RequestInit} [init]
 * @returns {Promise<Response | null>}
 */
async function fetchUpstream(url, service, request, init) {
  let fetchError
  try {
    return await fetch(url, init)
  } catch (error) {
    fetchError = error
  }
  logUpstreamError(
    {
      endpoint: stripQueryString(url),
      service,
      upstreamStatus: null,
      errorMessage: /** @type {Error} */ (fetchError).message
    },
    request
  )
  return null
}

/**
 * Returns the signed-in user's parcels as GeoJSON features (id, sheet_id,
 * parcel_id, areaHa) plus the bounding box the map fits its viewport to.
 * Mock mode embeds real polygon geometry and flags `mock: true` so the client
 * reads geometry from the geojson route; real mode returns no geometry — the
 * client streams it via the parcel-tiles route instead.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function parcelsHandler(request, h) {
  /** @type {HydratedParcel[]} */
  let parcels = []
  /** @type {unknown} */
  let parcelsError
  try {
    parcels = await fetchParcels(/** @type {AnyFormRequest} */ (/** @type {unknown} */ (request)))
  } catch (error) {
    parcelsError = error
  }
  if (parcelsError !== undefined) {
    const err = /** @type {Error & { code?: unknown, status?: unknown }} */ (parcelsError)
    let upstreamStatus
    if (typeof err.code === 'number') {
      upstreamStatus = err.code
    } else if (typeof err.status === 'number') {
      upstreamStatus = err.status
    } else {
      // error carries no numeric upstream status: fall through to statusCodes.serviceUnavailable below
    }
    logUpstreamError(
      { endpoint: ROUTES.parcels, service: SERVICE_LAND_GRANTS, upstreamStatus, errorMessage: err.message },
      request
    )
    return h.response({ error: err.message }).code(upstreamStatus ?? statusCodes.serviceUnavailable)
  }

  const parcelData = parcels.map((p) => ({
    id: stringifyParcel(p),
    sheetId: p.sheetId,
    parcelId: p.parcelId,
    areaHa: p.area?.value == null ? null : Number(p.area.value)
  }))

  if (isMockData()) {
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

  const features = parcelData.map((p) => ({
    type: 'Feature',
    id: p.id,
    properties: { id: p.id, sheet_id: p.sheetId, parcel_id: p.parcelId, areaHa: p.areaHa }
  }))
  const parcelIds = parcelData.map((p) => p.id)
  const bbox = await fetchParcelTileLocation(parcelIds)

  return h.response({ features, bbox }).code(statusCodes.ok)
}

/**
 * Mock mode only: serves the full GeoJSON FeatureCollection (with polygon
 * geometry) that parcelsHandler stashed in the session, so local dev works
 * without a running tile server. 404 when mock mode is disabled.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
function mockGeojsonHandler(request, h) {
  if (!isMockData()) {
    return h.response({ error: 'not found' }).code(statusCodes.notFound)
  }
  const features = /** @type {ParcelFeature[] | null} */ (request.yar.get('mapMockFeatures'))
  if (!features) {
    return h.response({ error: 'not found' }).code(statusCodes.notFound)
  }
  return h.response({ type: 'FeatureCollection', features }).code(statusCodes.ok)
}

/**
 * Proxies MapLibre vector-tile requests ({z}/{x}/{y}) to the land-grants API.
 * Looks up the user's parcel IDs server-side and sends them in the POST body,
 * so which parcels a user has never appears in a URL.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function tilesHandler(request, h) {
  const { z, x, y } = request.params
  let parcels = []
  let parcelsError

  try {
    parcels = /** @type {HydratedParcel[]} */ (
      await fetchParcels(/** @type {AnyFormRequest} */ (/** @type {unknown} */ (request)))
    )
  } catch (error) {
    parcelsError = error
  }
  if (parcelsError !== undefined) {
    logUpstreamError(
      {
        endpoint: ROUTES.parcelTiles,
        service: SERVICE_LAND_GRANTS,
        upstreamStatus: null,
        errorMessage: /** @type {Error} */ (parcelsError).message
      },
      request
    )
    return h.response().code(statusCodes.serviceUnavailable)
  }
  const parcelIds = parcels.map((p) => stringifyParcel(p))

  const upstream = `${LAND_GRANTS_API_URL}/api/v1/parcel-tiles/${z}/${x}/${y}`
  const response = await fetchUpstream(upstream, SERVICE_LAND_GRANTS, request, {
    method: 'POST',
    headers: {
      ...createApiHeadersForLandGrantsBackend(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ parcelIds })
  })
  if (!response) {
    return h.response().code(statusCodes.serviceUnavailable)
  }
  if (!response.ok) {
    return h.response().code(response.status)
  }

  const buffer = await response.arrayBuffer()
  return (
    h
      .response(withCompoundParcelIds(Buffer.from(buffer)))
      .code(statusCodes.ok)
      .type('application/x-protobuf')
      // private — tiles are per-user (session-authed), so only the browser may cache them
      .header(CACHE_CONTROL_HEADER, `private, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
  )
}

/**
 * Serves a locally built MapLibre style for the OS Maps raster basemap: one
 * raster source pointing at our key-injecting tile proxy and one raster layer.
 * No `glyphs` URL is set — parcel-label text is generated locally in the
 * browser by MapLibre (TinySDF), so no font files need hosting. No upstream
 * call is involved — the style is static apart from the origin, so there is
 * nothing to cache or fail.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
function osBasemapHandler(request, h) {
  const origin = publicOrigin(request)
  const style = {
    version: MAP_STYLE_SPEC_VERSION,
    sources: {
      'os-raster': {
        type: 'raster',
        tiles: [`${origin}${ROUTES.osTiles}`],
        tileSize: OS_TILE_SIZE_PX,
        minzoom: OS_MIN_ZOOM,
        maxzoom: OS_MAX_ZOOM,
        attribution: `© Crown copyright and database rights ${new Date().getFullYear()} OS`
      }
    },
    layers: [{ id: 'os-basemap', type: 'raster', source: 'os-raster' }]
  }

  return h
    .response(style)
    .code(statusCodes.ok)
    .type('application/json')
    .header(CACHE_CONTROL_HEADER, `private, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
}

/**
 * Proxies OS Maps raster tile requests ({z}/{x}/{y}) to api.os.uk, appending
 * the API key server-side so it never reaches the browser. The basemap layer
 * is fixed by OS_MAPS_LAYER — clients cannot request anything else with our key.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function osTileProxyHandler(request, h) {
  const { z, x, y } = request.params
  const apiKey = config.get('osMapsApiKey')
  const upstream = `${OS_MAPS_BASE_URL}/${OS_MAPS_LAYER}/${z}/${x}/${y}.png?key=${apiKey}`

  const response = await fetchUpstream(upstream, SERVICE_OS_MAPS, request)
  if (!response) {
    return h.response().code(statusCodes.serviceUnavailable)
  }
  if (!response.ok) {
    logUpstreamError(
      {
        endpoint: stripQueryString(upstream),
        service: SERVICE_OS_MAPS,
        upstreamStatus: response.status,
        errorMessage: 'OS basemap tile request failed'
      },
      request
    )
    return h.response().code(response.status)
  }

  // Stream the tile straight through instead of buffering it whole first.
  const contentLength = response.headers.get('content-length')
  let tileResponse = h
    .response(Readable.fromWeb(/** @type {import('stream/web').ReadableStream} */ (response.body)))
    .code(statusCodes.ok)
    .type(response.headers.get('content-type') ?? 'image/png')
    // public — OS basemap tiles are identical for every user
    .header(CACHE_CONTROL_HEADER, `public, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
  if (contentLength) {
    tileResponse = tileResponse.bytes(Number(contentLength))
  }
  return tileResponse
}

const ROUTES = {
  parcels: '/api/map/parcels',
  parcelsMockGeojson: '/api/map/parcels/geojson',
  parcelTiles: '/api/map/parcel-tiles/{z}/{x}/{y}',
  osBasemap: '/api/map/os-basemap',
  osTiles: '/api/map/os-tiles/{z}/{x}/{y}'
}

const tileParamsValidation = {
  params: Joi.object({
    z: Joi.number().integer().min(0).required(),
    x: Joi.number().integer().min(0).required(),
    y: Joi.number().integer().min(0).required()
  })
}

export const mapPlugin = {
  plugin: {
    name: 'map',
    register(server) {
      server.route({
        method: 'GET',
        path: ROUTES.parcels,
        options: { auth: { mode: 'required', strategy: 'session' } },
        handler: parcelsHandler
      })
      server.route({
        method: 'GET',
        path: ROUTES.parcelsMockGeojson,
        options: { auth: { mode: 'required', strategy: 'session' } },
        handler: mockGeojsonHandler
      })
      server.route({
        method: 'GET',
        path: ROUTES.parcelTiles,
        options: {
          auth: { mode: 'required', strategy: 'session' },
          validate: tileParamsValidation
        },
        handler: tilesHandler
      })
      server.route({
        method: 'GET',
        path: ROUTES.osBasemap,
        options: { auth: { mode: 'required', strategy: 'session' } },
        handler: osBasemapHandler
      })
      server.route({
        method: 'GET',
        path: ROUTES.osTiles,
        options: {
          auth: { mode: 'required', strategy: 'session' },
          validate: tileParamsValidation
        },
        handler: osTileProxyHandler
      })
    }
  }
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { HydratedParcel, ParcelFeature } from './types.js'
 */
