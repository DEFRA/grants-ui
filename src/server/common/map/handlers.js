import { Readable } from 'node:stream'
import { config } from '~/src/config/config.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { attempt } from '~/src/server/common/helpers/attempt.js'
import { readUpstreamStatus } from '~/src/server/common/helpers/errors.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { logHandledError } from '~/src/server/common/helpers/logging/handled-error.js'
import { fetchParcels } from '~/src/server/land-grants/services/land-grants.service.js'
import {
  fetchParcelTile,
  locateParcelTiles,
  LAND_GRANTS_ACTION_SIZE,
  LAND_GRANTS_ACTIONS
} from '~/src/server/land-grants/services/land-grants.client.js'
import { compactParcelReference, stringifyParcel } from '~/src/shared/format-parcel.js'
import { ROUTES } from './map-routes.js'
import { toParcelData, toGeoJsonFeatures } from './parcel-features.js'
import { withCompoundParcelIds } from './mvt-compound-id.js'
import { buildOsBasemapStyle, fetchOsTile } from './os-maps.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
import { fetchAuthorisedParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'
import { getAuthorisedParcel } from '~/src/server/land-grants/services/parcel-authorisation.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')
const TILE_CACHE_MAX_AGE_SECONDS = config.get('maps.land.tileCacheMaxAgeSeconds')
const SERVICE_LAND_GRANTS = 'land-grants-api'
const CACHE_CONTROL_HEADER = 'Cache-Control'
// Generic, so the upstream land-grants response body never reaches the browser;
// the real message is preserved in the structured error log.
const PARCELS_ERROR_MESSAGE = 'Unable to load your land parcels'
const SEARCH_ERROR_MESSAGE = 'Unable to search your land parcels'
const BBOX_ERROR_MESSAGE = 'Unable to locate the land parcel'

/**
 * The signed-in user's parcels, or the status to answer with when the
 * parcel lookup failed (logged here, using `endpoint` for ordinary errors).
 * @param {Request} request
 * @param {string} endpoint
 * @param {string[]} [fields]
 * @returns {Promise<{ ok: true, parcels: HydratedParcel[], userContext: LandGrantsUserContext } | { ok: false, status: number }>}
 */
async function loadUserParcels(request, endpoint, fields = [LAND_GRANTS_ACTION_SIZE]) {
  const formRequest = /** @type {AnyFormRequest} */ (/** @type {unknown} */ (request))
  const userContext = getLandGrantsUserContext(formRequest)
  const result = await attempt(() => fetchParcels(formRequest, userContext, fields))
  if (result.ok) {
    return { ok: true, parcels: result.value, userContext }
  }

  const err = /** @type {Error & { code?: unknown, status?: unknown }} */ (result.error)
  const upstreamStatus = readUpstreamStatus(err)
  logHandledError(err, request, {
    fallbackCode: LogCodes.SYSTEM.EXTERNAL_API_ERROR,
    fallbackDetails: { endpoint, service: SERVICE_LAND_GRANTS, upstreamStatus: upstreamStatus ?? null }
  })
  return { ok: false, status: upstreamStatus ?? statusCodes.serviceUnavailable }
}

/**
 * Returns the signed-in user's parcels as GeoJSON features (id, sheet_id,
 * parcel_id, areaHa and the journey-filtered available-action count) plus the bounding
 * box the map fits its viewport to.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export async function parcelsHandler(request, h) {
  const enabledLandActions = /** @type {{ enabledLandActions?: string[] }} */ (request.query)?.enabledLandActions ?? []
  const enableActionCount = config.get('landGrants.enableMapActionCount')
  const fields = [LAND_GRANTS_ACTION_SIZE]
  if (enableActionCount && enabledLandActions.length) {
    fields.push(LAND_GRANTS_ACTIONS)
  }
  const loaded = await loadUserParcels(request, ROUTES.parcels, fields)
  if (!loaded.ok) {
    return h.response({ error: PARCELS_ERROR_MESSAGE }).code(loaded.status)
  }

  const parcelData = toParcelData(loaded.parcels, enableActionCount ? enabledLandActions : undefined)
  if (!parcelData.length) {
    return h.response({ features: [], bbox: null }).code(statusCodes.ok).header(CACHE_CONTROL_HEADER, 'no-store')
  }
  const located = await attempt(() =>
    locateParcelTiles(
      parcelData.map((p) => p.id),
      LAND_GRANTS_API_URL,
      loaded.userContext
    )
  )
  if (!located.ok) {
    const status = readUpstreamStatus(/** @type {Error & { code?: unknown, status?: unknown }} */ (located.error))
    return h.response({ error: PARCELS_ERROR_MESSAGE }).code(status ?? statusCodes.serviceUnavailable)
  }
  const { bbox, parcels = [] } = located.value
  const boundsById = new Map(parcels.map((parcel) => [parcel.id, parcel.bounds]))
  // Incomplete locations would silently undercount the holding's badges.
  if (parcelData.some((parcel) => !boundsById.has(parcel.id))) {
    logHandledError(new Error('Incomplete parcel locations'), request, {
      fallbackCode: LogCodes.SYSTEM.EXTERNAL_API_ERROR,
      fallbackDetails: { endpoint: ROUTES.parcels, service: SERVICE_LAND_GRANTS, upstreamStatus: null }
    })
    return h.response({ error: PARCELS_ERROR_MESSAGE }).code(statusCodes.serviceUnavailable)
  }
  const features = toGeoJsonFeatures(parcelData).map((feature) => ({
    ...feature,
    properties: { ...feature.properties, bounds: boundsById.get(feature.id) }
  }))

  // User-specific: never let the browser replay this for a different signed-in
  // user against the same URL after a logout/login.
  return h.response({ features, bbox }).code(statusCodes.ok).header(CACHE_CONTROL_HEADER, 'no-store')
}

/**
 * Parcel IDs from the user's holding matching the typed query, ignoring case
 * and the space or hyphen. Served from the consolidated view, so typing never
 * reaches the land-grants API.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export async function parcelSearchHandler(request, h) {
  const formRequest = /** @type {AnyFormRequest} */ (/** @type {unknown} */ (request))
  const parcelIds = await fetchAuthorisedParcelIds(formRequest)
  if (!parcelIds) {
    // The parcel cache logs the lookup failure before returning null.
    return h.response({ error: SEARCH_ERROR_MESSAGE }).code(statusCodes.serviceUnavailable)
  }

  // A query of only separators compacts to nothing, which would match every parcel.
  const query = compactParcelReference(/** @type {{ q: string }} */ (request.query).q)
  const matches = query
    ? parcelIds.filter((id) => compactParcelReference(id).includes(query)).sort((a, b) => a.localeCompare(b))
    : []

  return h.response({ parcelIds: matches }).code(statusCodes.ok).header(CACHE_CONTROL_HEADER, 'no-store')
}

/**
 * The WGS84 bounding box of one of the signed-in user's parcels, for the map
 * to frame a search result whose geometry it has not drawn yet.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export async function parcelBboxHandler(request, h) {
  const parcel = await getAuthorisedParcel(request)
  if (!parcel) {
    return h.response().code(statusCodes.forbidden)
  }

  const userContext = getLandGrantsUserContext(parcel.formRequest)
  // locateParcelTiles logs its own upstream failures and throws with the
  // upstream status on `.code`/`.status`, so an outage is not reported as 404.
  const located = await attempt(() => locateParcelTiles([request.params.parcelId], LAND_GRANTS_API_URL, userContext))
  if (!located.ok) {
    const status = readUpstreamStatus(/** @type {Error & { code?: unknown, status?: unknown }} */ (located.error))
    return h.response({ error: BBOX_ERROR_MESSAGE }).code(status ?? statusCodes.serviceUnavailable)
  }
  const bbox = located.value?.bbox
  if (!bbox) {
    return h.response({ error: BBOX_ERROR_MESSAGE }).code(statusCodes.notFound)
  }

  return h.response({ bbox }).code(statusCodes.ok).header(CACHE_CONTROL_HEADER, 'no-store')
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
  const loaded = await loadUserParcels(request, ROUTES.parcelTiles)
  if (!loaded.ok) {
    return h.response().code(loaded.status)
  }
  const parcelIds = loaded.parcels.map((p) => stringifyParcel(p))

  // fetchParcelTile logs its own upstream failures and throws with the upstream
  // status on `.code`/`.status`; a 404 tile is not retried, a 5xx is.
  const tileResult = await attempt(() => fetchParcelTile(parcelIds, z, x, y, LAND_GRANTS_API_URL, loaded.userContext))
  if (!tileResult.ok) {
    const status = readUpstreamStatus(/** @type {Error & { code?: unknown, status?: unknown }} */ (tileResult.error))
    return h.response().code(status ?? statusCodes.serviceUnavailable)
  }

  // These tiles carry the signed-in user's own parcel geometry, but the URL
  // is only {z}/{x}/{y} — no user-scoping — so a max-age here would let the
  // browser replay one user's parcels to whoever is signed in next at the
  // same tile coordinate after a logout/login. Must never be cached.
  return h
    .response(withCompoundParcelIds(tileResult.value))
    .code(statusCodes.ok)
    .type('application/x-protobuf')
    .header(CACHE_CONTROL_HEADER, 'no-store')
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
  // An ok-but-empty upstream (204/null body) would throw in Readable.fromWeb and
  // surface as a 500; degrade to a clean 502 instead.
  if (!response.body) {
    return h.response().code(statusCodes.badGateway)
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
 * @import { HydratedParcel } from './types.js'
 * @import { LandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
 */
