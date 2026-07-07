import Joi from 'joi'
import { config } from '~/src/config/config.js'
import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { fetchParcels, fetchParcelTileLocation } from '~/src/server/land-grants/services/land-grants.service.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { isMockData, buildMockFeatures } from './map.mock.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')
const OS_MAPS_BASE_URL = 'https://api.os.uk/maps/vector/v1/vts'
// Web Mercator — required by MapLibre; OS defaults to EPSG:27700 (British National Grid) without this
const OS_MAPS_SRS = '3857'
const TILE_CACHE_MAX_AGE_SECONDS = 3600
const SERVICE_LAND_GRANTS = 'land-grants-api'
const SERVICE_OS_MAPS = 'os-maps'
// Matches OS Maps URLs so they can be rewritten to our proxy — derived from OS_MAPS_BASE_URL so the two can't drift
const OS_URL_RE = new RegExp(`^${OS_MAPS_BASE_URL.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}`)

/** Everything before the first `?` — OS Maps query strings carry the API key. */
const stripQueryString = (/** @type {string} */ url) => url.split('?')[0]

/**
 * Server-scoped map state, stored on `server.app` rather than at module level
 * so its lifetime is tied to the server instance (tests get a fresh cache with
 * each server they build — no reset hook needed). `osBasemapPromise` is the
 * in-flight/settled basemap load, shared across concurrent requests so a cold
 * start fires exactly one pair of upstream fetches; it is reset to undefined
 * on failure so the next request retries.
 * @typedef {{ osBasemapPromise?: ReturnType<typeof loadOsBasemap> }} MapServerState
 */

/**
 * Absolute origin for URLs the browser will fetch. Prefers the configured
 * base URL: behind the platform's TLS-terminating proxy `server.info.protocol`
 * is 'http', which would produce mixed-content URLs the browser blocks on the
 * https page. Falls back to request info for bare local dev where baseUrl is ''.
 * @param {Request} request
 */
function publicOrigin(request) {
  const baseUrl = /** @type {string} */ (config.get('baseUrl'))
  return baseUrl ? baseUrl.replace(/\/+$/u, '') : `${request.server.info.protocol}://${request.info.host}`
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
  // Logging happens outside the catch — the grants-ui/try-catch-allowed-functions
  // lint rule forbids log calls inside catch blocks.
  /** @type {unknown} */
  let fetchError
  try {
    return await fetch(url, init)
  } catch (error) {
    fetchError = error
  }
  logUpstreamError(
    {
      // Strip the query string — OS Maps URLs carry the API key in it
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
  /** @type {HydratedParcel[]} */
  let parcels = []
  /** @type {unknown} */
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
      .response(Buffer.from(buffer))
      .code(statusCodes.ok)
      .type('application/x-protobuf')
      // private — tiles are per-user (session-authed), so only the browser may cache them
      .header('Cache-Control', `private, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
  )
}

/**
 * Rewrite an OS Maps URL to our absolute proxy path, stripping query params
 * (the proxy re-adds key+srs itself). Uses string ops to preserve template
 * tokens like {fontstack}/{range} that new URL() would percent-encode.
 * @param {string} url
 * @param {string} origin  e.g. "http://localhost:3000"
 */
const proxyOsUrl = (url, origin) => `${origin}/api/map/os-tiles${stripQueryString(url.replace(OS_URL_RE, ''))}`

/**
 * Rewrite a single OS Maps source entry to go through our proxy.
 * If the source uses a tilejson `url`, expands it to inline `tiles` using the
 * real tile URL template fetched from the tilejson — no hardcoded paths.
 * @param {Record<string, unknown>} source
 * @param {string} tileUrlTemplate  proxied tile URL template from the tilejson
 * @returns {Record<string, unknown>}
 */
function rewriteOsSource(source, tileUrlTemplate) {
  if (typeof source.url === 'string' && OS_URL_RE.test(source.url)) {
    return Object.fromEntries([['tiles', [tileUrlTemplate]], ...Object.entries(source).filter(([k]) => k !== 'url')])
  }
  return source
}

/**
 * Returns a new style object with all OS Maps URLs rewritten to go through our
 * proxy, so the API key is never exposed to the browser.
 * @param {Record<string, unknown>} style
 * @param {string} origin
 * @param {string} tileUrlTemplate  proxied tile URL template from the tilejson
 * @returns {Record<string, unknown>}
 */
function withProxiedOsUrls(style, origin, tileUrlTemplate) {
  const sources =
    style.sources && typeof style.sources === 'object'
      ? Object.fromEntries(Object.entries(style.sources).map(([k, v]) => [k, rewriteOsSource(v, tileUrlTemplate)]))
      : style.sources

  return {
    ...style,
    sources,
    ...(typeof style.glyphs === 'string' && OS_URL_RE.test(style.glyphs)
      ? { glyphs: proxyOsUrl(style.glyphs, origin) }
      : {}),
    ...(typeof style.sprite === 'string' && OS_URL_RE.test(style.sprite)
      ? { sprite: proxyOsUrl(style.sprite, origin) }
      : {})
  }
}

/**
 * Fetches the OS Maps style JSON and tilejson in parallel. Returns an
 * `{ errorCode }` result instead of throwing so upstream failures map cleanly
 * to a response status. The tile URL is stored relative to the OS base so the
 * absolute proxy URL can be rebuilt per request from the caller's origin.
 * @param {Request} request
 * @returns {Promise<{ errorCode: number } | { styleJson: Record<string, unknown>, osRelativeTileUrl: string }>}
 */
async function loadOsBasemap(request) {
  const apiKey = config.get('osMapsApiKey')
  const [styleRes, tilejsonRes] = await Promise.all([
    fetchUpstream(`${OS_MAPS_BASE_URL}/resources/styles?key=${apiKey}&srs=${OS_MAPS_SRS}`, SERVICE_OS_MAPS, request),
    fetchUpstream(`${OS_MAPS_BASE_URL}?key=${apiKey}&srs=${OS_MAPS_SRS}`, SERVICE_OS_MAPS, request)
  ])
  if (!styleRes || !tilejsonRes) {
    return { errorCode: statusCodes.serviceUnavailable }
  }
  if (!styleRes.ok) {
    return { errorCode: styleRes.status }
  }
  if (!tilejsonRes.ok) {
    return { errorCode: tilejsonRes.status }
  }

  const styleJson = /** @type {Record<string, unknown>} */ (await styleRes.json())
  const tilejson = /** @type {{ tiles?: string[] }} */ (await tilejsonRes.json())
  const rawTileUrl = tilejson.tiles?.[0]
  if (!rawTileUrl) {
    return { errorCode: statusCodes.serviceUnavailable }
  }

  return { styleJson, osRelativeTileUrl: stripQueryString(rawTileUrl.replace(OS_URL_RE, '')) }
}

/**
 * Serves the OS Maps style with all OS URLs rewritten to our proxy so the API
 * key is never sent to the browser. The upstream load is shared across
 * concurrent requests and cached on the server instance; failures are not
 * cached, so the next request retries.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function osBasemapHandler(request, h) {
  const app = /** @type {MapServerState} */ (request.server.app)
  app.osBasemapPromise = app.osBasemapPromise ?? loadOsBasemap(request)
  let result
  /** @type {unknown} */
  let basemapError
  try {
    result = await app.osBasemapPromise
  } catch (error) {
    basemapError = error
  }
  if (basemapError !== undefined || !result) {
    app.osBasemapPromise = undefined
    logUpstreamError(
      {
        endpoint: OS_MAPS_BASE_URL,
        service: SERVICE_OS_MAPS,
        upstreamStatus: null,
        errorMessage: basemapError instanceof Error ? basemapError.message : 'OS basemap load failed'
      },
      request
    )
    return h.response().code(statusCodes.serviceUnavailable)
  }
  if ('errorCode' in result) {
    app.osBasemapPromise = undefined
    // Surface non-OK upstream statuses — a 401 here is the signature of a
    // missing/invalid OS_MAPS_API_KEY and would otherwise be invisible in logs.
    logUpstreamError(
      {
        endpoint: OS_MAPS_BASE_URL,
        service: SERVICE_OS_MAPS,
        upstreamStatus: result.errorCode,
        errorMessage: 'OS basemap load failed'
      },
      request
    )
    return h.response().code(result.errorCode)
  }

  const origin = publicOrigin(request)
  const tileUrlTemplate = `${origin}/api/map/os-tiles${result.osRelativeTileUrl}`
  return h
    .response(withProxiedOsUrls(result.styleJson, origin, tileUrlTemplate))
    .code(statusCodes.ok)
    .type('application/json')
    .header('Cache-Control', `private, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
}

/**
 * Proxy OS Maps requests (tilejson, tiles, glyphs, sprites) — appends the API key server-side.
 * Handles both the root tilejson endpoint (empty path) and all sub-paths.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function osTileProxyHandler(request, h) {
  const apiKey = config.get('osMapsApiKey')
  const suffix = request.params.path ? `/${request.params.path}` : ''
  const upstream = new URL(`${OS_MAPS_BASE_URL}${suffix}`)
  if (upstream.href !== OS_MAPS_BASE_URL && !upstream.href.startsWith(`${OS_MAPS_BASE_URL}/`)) {
    return h.response().code(statusCodes.badRequest)
  }
  // Pass through any query params the client sent (e.g. {fontstack}/{range}
  // expansion) but always inject key and srs.
  for (const [k, v] of Object.entries(request.query)) {
    upstream.searchParams.set(k, String(v))
  }
  upstream.searchParams.set('key', apiKey)
  upstream.searchParams.set('srs', OS_MAPS_SRS)

  const response = await fetchUpstream(upstream.href, SERVICE_OS_MAPS, request)
  if (!response) {
    return h.response().code(statusCodes.serviceUnavailable)
  }
  if (!response.ok) {
    return h.response().code(response.status)
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  const buffer = await response.arrayBuffer()
  return (
    h
      .response(Buffer.from(buffer))
      .code(statusCodes.ok)
      .type(contentType)
      // public — OS basemap tiles are identical for every user
      .header('Cache-Control', `public, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
  )
}

const ROUTES = {
  parcels: '/api/map/parcels',
  parcelsMockGeojson: '/api/map/parcels/geojson',
  parcelTiles: '/api/map/parcel-tiles/{z}/{x}/{y}',
  osBasemap: '/api/map/os-basemap',
  osTiles: '/api/map/os-tiles/{path*}'
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
          validate: {
            params: Joi.object({
              z: Joi.number().integer().min(0).required(),
              x: Joi.number().integer().min(0).required(),
              y: Joi.number().integer().min(0).required()
            })
          }
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
          validate: {
            params: Joi.object({ path: Joi.string().allow('').default('') })
          }
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
