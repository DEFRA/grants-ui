import Joi from 'joi'
import { config } from '~/src/config/config.js'
import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { fetchParcels, fetchParcelTileLocation } from '~/src/server/land-grants/services/land-grants.service.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { isMockData, buildMockFeatures } from './map.mock.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')
const OS_MAPS_BASE_URL = 'https://api.os.uk/maps/vector/v1/vts'
// Web Mercator — required by MapLibre; OS defaults to EPSG:27700 (British National Grid) without this
const OS_MAPS_SRS = '3857'
const TILE_CACHE_MAX_AGE_SECONDS = 3600
const SERVICE_LAND_GRANTS = 'land-grants-api'
const SERVICE_OS_MAPS = 'os-maps'
// Matches OS Maps URLs so they can be rewritten to our proxy — derived from OS_MAPS_BASE_URL so the two can't drift
const OS_URL_RE = new RegExp(`^${OS_MAPS_BASE_URL.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`)
const OS_QS_RE = /\?[^]*$/u

/** @type {{ styleJson: Record<string, unknown>, osRelativeTileUrl: string } | null} */
let osBasemapCache = null

export function resetOsBasemapCache() {
  osBasemapCache = null
}

/**
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
    if (typeof err?.code === 'number') {
      upstreamStatus = err.code
    } else if (typeof err?.status === 'number') {
      upstreamStatus = err.status
    }
    log(
      LogCodes.SYSTEM.EXTERNAL_API_ERROR,
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
  /** @type {unknown} */
  let fetchParcelsError
  try {
    parcels = /** @type {HydratedParcel[]} */ (
      await fetchParcels(/** @type {AnyFormRequest} */ (/** @type {unknown} */ (request)))
    )
  } catch (error) {
    fetchParcelsError = error
  }
  if (fetchParcelsError !== undefined) {
    log(
      LogCodes.SYSTEM.EXTERNAL_API_ERROR,
      {
        endpoint: ROUTES.parcelTiles,
        service: SERVICE_LAND_GRANTS,
        upstreamStatus: null,
        errorMessage: /** @type {Error} */ (fetchParcelsError).message
      },
      request
    )
    return h.response().code(statusCodes.serviceUnavailable)
  }
  const parcelIds = parcels.map((p) => stringifyParcel(p))

  const upstream = `${LAND_GRANTS_API_URL}/api/v1/parcel-tiles/${z}/${x}/${y}`

  let response
  /** @type {unknown} */
  let tilesFetchError
  try {
    response = await fetch(upstream, {
      method: 'POST',
      headers: {
        ...createApiHeadersForLandGrantsBackend(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ parcelIds })
    })
  } catch (error) {
    tilesFetchError = error
  }
  if (tilesFetchError !== undefined || !response) {
    if (tilesFetchError !== undefined) {
      log(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        {
          endpoint: upstream,
          service: SERVICE_LAND_GRANTS,
          upstreamStatus: null,
          errorMessage: /** @type {Error} */ (tilesFetchError).message
        },
        request
      )
    }
    return h.response().code(statusCodes.serviceUnavailable)
  }

  if (!response.ok) {
    return h.response().code(response.status)
  }

  const buffer = await response.arrayBuffer()
  return h.response(Buffer.from(buffer)).code(statusCodes.ok).type('application/x-protobuf')
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
 * Fetches the OS Maps style JSON and tilejson in parallel, rewrites all OS URLs
 * to go through our proxy so the API key is never exposed to the browser.
 * Results are cached in memory — the style and tile URL template are stable for
 * the lifetime of the process.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function osBasemapHandler(request, h) {
  const apiKey = config.get('osMapsApiKey')
  const origin = `${request.server.info.protocol}://${request.info.host}`

  if (!osBasemapCache) {
    let styleRes, tilejsonRes
    /** @type {unknown} */
    let basemapFetchError
    try {
      ;[styleRes, tilejsonRes] = await Promise.all([
        fetch(`${OS_MAPS_BASE_URL}/resources/styles?key=${apiKey}&srs=${OS_MAPS_SRS}`),
        fetch(`${OS_MAPS_BASE_URL}?key=${apiKey}&srs=${OS_MAPS_SRS}`)
      ])
    } catch (error) {
      basemapFetchError = error
    }
    if (basemapFetchError !== undefined || !styleRes || !tilejsonRes) {
      if (basemapFetchError !== undefined) {
        log(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          {
            endpoint: OS_MAPS_BASE_URL,
            service: SERVICE_OS_MAPS,
            upstreamStatus: null,
            errorMessage: /** @type {Error} */ (basemapFetchError).message
          },
          request
        )
      }
      return h.response().code(statusCodes.serviceUnavailable)
    }
    if (!styleRes.ok) {
      return h.response().code(styleRes.status)
    }
    if (!tilejsonRes.ok) {
      return h.response().code(tilejsonRes.status)
    }

    const styleJson = /** @type {Record<string, unknown>} */ (await styleRes.json())
    const tilejson = /** @type {{ tiles?: string[] }} */ (await tilejsonRes.json())
    const rawTileUrl = tilejson.tiles?.[0]
    if (!rawTileUrl) {
      return h.response().code(statusCodes.serviceUnavailable)
    }

    osBasemapCache = { styleJson, osRelativeTileUrl: rawTileUrl.replace(OS_URL_RE, '').replace(OS_QS_RE, '') }
  }

  const tileUrlTemplate = `${origin}/api/map/os-tiles${osBasemapCache.osRelativeTileUrl}`
  return h
    .response(withProxiedOsUrls(osBasemapCache.styleJson, origin, tileUrlTemplate))
    .code(statusCodes.ok)
    .type('application/json')
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
  /** @type {unknown} */
  let osFetchError
  try {
    response = await fetch(upstream)
  } catch (error) {
    osFetchError = error
  }
  if (osFetchError !== undefined || !response) {
    if (osFetchError !== undefined) {
      log(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        {
          endpoint: upstream,
          service: SERVICE_OS_MAPS,
          upstreamStatus: null,
          errorMessage: /** @type {Error} */ (osFetchError).message
        },
        request
      )
    }
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
