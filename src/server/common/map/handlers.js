import { Readable } from 'node:stream'
import { config } from '~/src/config/config.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { attempt } from '~/src/server/common/helpers/attempt.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'
import { fetchParcels, fetchParcelTileLocation } from '~/src/server/land-grants/services/land-grants.service.js'
import { fetchParcelTile } from '~/src/server/land-grants/services/land-grants.client.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { ROUTES } from './map-routes.js'
import { toParcelData, toGeoJsonFeatures } from './parcel-features.js'
import { withCompoundParcelIds } from './mvt-compound-id.js'
import { buildOsBasemapStyle, fetchOsTile } from './os-maps.js'
import { isMockData } from './map.mock.js'
import { buildMockParcelsResponse } from './map.mock.plugin.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')
const TILE_CACHE_MAX_AGE_SECONDS = config.get('mapTileCacheMaxAgeSeconds')
const SERVICE_LAND_GRANTS = 'land-grants-api'
const CACHE_CONTROL_HEADER = 'Cache-Control'

/**
 * The land-grants client reports the upstream status as `code` or `status`
 * depending on where the call failed.
 * @param {Error & { code?: unknown, status?: unknown }} error
 * @returns {number | undefined}
 */
function numericUpstreamStatus(error) {
  if (typeof error.code === 'number') {
    return error.code
  }
  if (typeof error.status === 'number') {
    return error.status
  }
  return undefined
}

/**
 * Returns the signed-in user's parcels as GeoJSON features (id, sheet_id,
 * parcel_id, areaHa) plus the bounding box the map fits its viewport to.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export async function parcelsHandler(request, h) {
  const result = await attempt(() => fetchParcels(/** @type {AnyFormRequest} */ (/** @type {unknown} */ (request))))

  if (!result.ok) {
    const err = /** @type {Error & { code?: unknown, status?: unknown }} */ (result.error)
    const upstreamStatus = numericUpstreamStatus(err)
    logUpstreamError(
      { endpoint: ROUTES.parcels, service: SERVICE_LAND_GRANTS, upstreamStatus, errorMessage: err.message },
      request
    )
    return h.response({ error: err.message }).code(upstreamStatus ?? statusCodes.serviceUnavailable)
  }

  const parcelData = toParcelData(result.value)

  if (isMockData()) {
    return buildMockParcelsResponse(request, parcelData, h)
  }

  const features = toGeoJsonFeatures(parcelData)
  const bbox = await fetchParcelTileLocation(parcelData.map((p) => p.id))

  return h.response({ features, bbox }).code(statusCodes.ok)
}

/**
 * Proxies MapLibre vector-tile requests ({z}/{x}/{y}) to the land-grants API
 * through the shared client, so the map inherits the same retry policy as every
 * other land-grants call. Looks up the user's parcel IDs server-side and sends
 * them in the POST body, so which parcels a user has never appears in a URL.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export async function tilesHandler(request, h) {
  const { z, x, y } = request.params
  const parcelsResult = await attempt(() =>
    fetchParcels(/** @type {AnyFormRequest} */ (/** @type {unknown} */ (request)))
  )

  if (!parcelsResult.ok) {
    logUpstreamError(
      {
        endpoint: ROUTES.parcelTiles,
        service: SERVICE_LAND_GRANTS,
        upstreamStatus: null,
        errorMessage: parcelsResult.error.message
      },
      request
    )
    return h.response().code(statusCodes.serviceUnavailable)
  }
  const parcelIds = parcelsResult.value.map((p) => stringifyParcel(p))

  // fetchParcelTile logs its own upstream failures and throws with the upstream
  // status on `.code`/`.status`; a 404 tile is not retried, a 5xx is.
  const tileResult = await attempt(() => fetchParcelTile(parcelIds, z, x, y, LAND_GRANTS_API_URL))
  if (!tileResult.ok) {
    const status = numericUpstreamStatus(/** @type {Error & { code?: unknown, status?: unknown }} */ (tileResult.error))
    return h.response().code(status ?? statusCodes.serviceUnavailable)
  }

  return h
    .response(withCompoundParcelIds(tileResult.value))
    .code(statusCodes.ok)
    .type('application/x-protobuf')
    .header(CACHE_CONTROL_HEADER, `private, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
}

/**
 * Serves the locally built MapLibre style for the OS Maps raster basemap.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export function osBasemapHandler(request, h) {
  return h
    .response(buildOsBasemapStyle(request))
    .code(statusCodes.ok)
    .type('application/json')
    .header(CACHE_CONTROL_HEADER, `private, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
}

/**
 * Proxies OS Maps raster tile requests ({z}/{x}/{y}) to api.os.uk via the OS
 * client, which appends the API key server-side so it never reaches the browser.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export async function osTileProxyHandler(request, h) {
  const { z, x, y } = request.params

  const response = await fetchOsTile(z, x, y, request)
  if (!response) {
    return h.response().code(statusCodes.serviceUnavailable)
  }
  if (!response.ok) {
    return h.response().code(response.status)
  }

  const contentLength = response.headers.get('content-length')
  let tileResponse = h
    .response(Readable.fromWeb(/** @type {import('stream/web').ReadableStream} */ (response.body)))
    .code(statusCodes.ok)
    .type(response.headers.get('content-type') ?? 'image/png')
    .header(CACHE_CONTROL_HEADER, `public, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
  if (contentLength) {
    tileResponse = tileResponse.bytes(Number(contentLength))
  }
  return tileResponse
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
