import Joi from 'joi'
import { config } from '~/src/config/config.js'
import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { fetchParcels, fetchParcelTileLocation } from '~/src/server/land-grants/services/land-grants.service.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { isMockData, buildMockFeatures } from './map.mock.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')
const OS_MAPS_BASE_URL = 'https://api.os.uk/maps/vector/v1/vts'
const OS_MAPS_MAX_ZOOM = 15
// Web Mercator — required by MapLibre; OS defaults to EPSG:27700 (British National Grid) without this
const OS_MAPS_SRS = '3857'
const TILE_CACHE_MAX_AGE_SECONDS = 3600
// Matches OS Maps URLs so they can be rewritten to our proxy — derived from OS_MAPS_BASE_URL so the two can't drift
const OS_URL_RE = new RegExp(`^${OS_MAPS_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
const OS_QS_RE = /\?.*$/

/**
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function parcelsHandler(request, h) {
  /** @type {HydratedParcel[]} */
  let parcels = []
  try {
    parcels = await fetchParcels(/** @type {AnyFormRequest} */ (/** @type {unknown} */ (request)))
  } catch (error) {
    const message = /** @type {Error} */ (error).message
    const upstreamStatus =
      /** @type {{ code?: number, status?: number }} */ (error)?.code ??
      /** @type {{ code?: number, status?: number }} */ (error)?.status
    return h.response({ error: message }).code(upstreamStatus ?? statusCodes.serviceUnavailable)
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
        tileUrl: null,
        geojsonUrl: '/api/map/parcels/geojson'
      })
      .code(statusCodes.ok)
  }

  const features = parcelData.map((p) => ({
    type: 'Feature',
    id: p.id,
    properties: { id: p.id, sheet_id: p.sheetId, parcel_id: p.parcelId, areaHa: p.areaHa }
  }))
  const parcelIds = parcelData.map((p) => p.id)
  const bbox = await fetchParcelTileLocation(parcelIds).catch(() => null)
  const tileUrl = parcelIds.length > 0 ? '/land-grants/parcel-tiles/{z}/{x}/{y}' : null

  return h.response({ features, bbox, tileUrl }).code(statusCodes.ok)
}

/**
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
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function tilesHandler(request, h) {
  const { z, x, y } = request.params
  let parcels = []
  try {
    parcels = /** @type {HydratedParcel[]} */ (
      await fetchParcels(/** @type {AnyFormRequest} */ (/** @type {unknown} */ (request)))
    )
  } catch {
    return h.response().code(statusCodes.serviceUnavailable)
  }
  const parcelIds = parcels.map((p) => stringifyParcel(p))

  const upstream = `${LAND_GRANTS_API_URL}/api/v1/parcel-tiles/${z}/${x}/${y}`

  let response
  try {
    response = await fetch(upstream, {
      method: 'POST',
      headers: {
        ...createApiHeadersForLandGrantsBackend(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ parcelIds })
    })
  } catch {
    return h.response().code(statusCodes.serviceUnavailable)
  }

  if (!response.ok) {
    return h.response().code(response.status)
  }

  const buffer = await response.arrayBuffer()
  return h
    .response(Buffer.from(buffer))
    .code(statusCodes.ok)
    .type('application/x-protobuf')
    .header('Cache-Control', `public, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
}

/**
 * Rewrite an OS Maps URL to our absolute proxy path, stripping query params
 * (the proxy re-adds key+srs itself). Uses string ops to preserve template
 * tokens like {fontstack}/{range} that new URL() would percent-encode.
 * @param {string} url
 * @param {string} origin  e.g. "http://localhost:3000"
 */
const proxyOsUrl = (url, origin) => `${origin}/api/map/os-tiles${url.replace(OS_URL_RE, '').replace(OS_QS_RE, '')}`

/**
 * Rewrite a single OS Maps source entry to go through our proxy.
 * If the source uses a tilejson `url`, expands it to inline `tiles` so MapLibre
 * never fetches the tilejson directly (which would return unproxied tile URLs).
 * Cap at z15 — the free OS Vector Tile API returns 403 for z16+.
 * @param {Record<string, unknown>} source
 * @param {string} origin
 * @returns {Record<string, unknown>}
 */
function rewriteOsSource(source, origin) {
  if (typeof source.url === 'string' && OS_URL_RE.test(source.url)) {
    const { url: _url, ...rest } = source
    return { ...rest, tiles: [`${origin}/api/map/os-tiles/tile/{z}/{y}/{x}.pbf`], maxzoom: OS_MAPS_MAX_ZOOM }
  }
  if (Array.isArray(source.tiles)) {
    return {
      ...source,
      tiles: source.tiles.map((t) => (typeof t === 'string' && OS_URL_RE.test(t) ? proxyOsUrl(t, origin) : t))
    }
  }
  return source
}

/**
 * Returns a new style object with all OS Maps URLs rewritten to go through our
 * proxy, so the API key is never exposed to the browser.
 * @param {Record<string, unknown>} style
 * @param {string} origin
 * @returns {Record<string, unknown>}
 */
function withProxiedOsUrls(style, origin) {
  const sources =
    style.sources && typeof style.sources === 'object'
      ? Object.fromEntries(Object.entries(style.sources).map(([k, v]) => [k, rewriteOsSource(v, origin)]))
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
 * Fetches the OS Maps vector tile style JSON and rewrites all OS URLs to go
 * through our tile proxy, so the API key is injected server-side and never
 * exposed to the browser. MapLibre uses this style to render the basemap.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function osBasemapHandler(request, h) {
  const apiKey = config.get('osMapsApiKey')
  const upstream = `${OS_MAPS_BASE_URL}/resources/styles?key=${apiKey}&srs=${OS_MAPS_SRS}`
  let response
  try {
    response = await fetch(upstream)
  } catch {
    return h.response().code(statusCodes.serviceUnavailable)
  }
  if (!response.ok) {
    return h.response().code(response.status)
  }

  const origin = `${request.server.info.protocol}://${request.info.host}`
  const styleJson = /** @type {Record<string, unknown>} */ (await response.json())
  return h.response(withProxiedOsUrls(styleJson, origin)).code(statusCodes.ok).type('application/json')
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
  // Pass through any query params the client sent (e.g. {fontstack}/{range} expansion)
  // but always inject key and srs.
  const qs = new URLSearchParams(/** @type {Record<string,string>} */ (/** @type {unknown} */ (request.query)))
  qs.set('key', apiKey)
  qs.set('srs', OS_MAPS_SRS)
  const upstream = `${OS_MAPS_BASE_URL}${suffix}?${qs.toString()}`

  let response
  try {
    response = await fetch(upstream)
  } catch {
    return h.response().code(statusCodes.serviceUnavailable)
  }
  if (!response.ok) {
    return h.response().code(response.status)
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  const buffer = await response.arrayBuffer()
  return h
    .response(Buffer.from(buffer))
    .code(statusCodes.ok)
    .type(contentType)
    .header('Cache-Control', `public, max-age=${TILE_CACHE_MAX_AGE_SECONDS}`)
}

export const mapPlugin = {
  plugin: {
    name: 'map',
    register(server) {
      server.route({
        method: 'GET',
        path: '/api/map/parcels',
        options: { auth: { mode: 'required', strategy: 'session' } },
        handler: parcelsHandler
      })
      server.route({
        method: 'GET',
        path: '/api/map/parcels/geojson',
        handler: mockGeojsonHandler
      })
      server.route({
        method: 'GET',
        path: '/land-grants/parcel-tiles/{z}/{x}/{y}',
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
        path: '/api/map/os-basemap',
        handler: osBasemapHandler
      })
      server.route({
        method: 'GET',
        path: '/api/map/os-tiles/{path*}',
        options: {
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
