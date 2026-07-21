import { config } from '~/src/config/config.js'
import { attempt } from '~/src/server/common/helpers/attempt.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'
import { ROUTES } from './map-routes.js'

const OS_MAPS_LAYER = 'Outdoor_3857'
const SERVICE_OS_MAPS = 'os-maps'
const MAP_STYLE_SPEC_VERSION = 8
const OS_TILE_SIZE_PX = 256

export const OS_MIN_ZOOM = 7
export const OS_MAX_ZOOM = 20

/** Everything before the first `?` — OS Maps query strings carry the API key. */
const stripQueryString = (/** @type {string} */ url) => url.split('?')[0]

/**
 * Builds the upstream OS raster tile URL, injecting the fixed layer and the API
 * key server-side so the key never reaches the browser.
 * @param {string | number} z
 * @param {string | number} x
 * @param {string | number} y
 * @returns {string}
 */
function buildOsTileUrl(z, x, y) {
  const baseUrl = config.get('osMapsBaseUrl')
  const apiKey = config.get('osMapsApiKey')
  return `${baseUrl}/${OS_MAPS_LAYER}/${z}/${x}/${y}.png?key=${apiKey}`
}

/**
 * Fetches a single OS raster basemap tile. Returns the upstream Response (ok or
 * not — the caller maps a non-ok status straight through) or null on a network
 * failure.
 * @param {string | number} z
 * @param {string | number} x
 * @param {string | number} y
 * @param {Request} request
 * @returns {Promise<Response | null>}
 */
export async function fetchOsTile(z, x, y, request) {
  const upstream = buildOsTileUrl(z, x, y)
  const endpoint = stripQueryString(upstream)

  const result = await attempt(() => fetch(upstream))
  if (!result.ok) {
    logUpstreamError(
      { endpoint, service: SERVICE_OS_MAPS, upstreamStatus: null, errorMessage: result.error.message },
      request
    )
    return null
  }

  const response = result.value
  if (!response.ok) {
    logUpstreamError(
      {
        endpoint,
        service: SERVICE_OS_MAPS,
        upstreamStatus: response.status,
        errorMessage: 'OS basemap tile request failed'
      },
      request
    )
  }
  return response
}

/**
 * Absolute URL base for URLs the browser will fetch.
 * @param {Request} request
 */
export function publicOrigin(request) {
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
 * Builds a locally hosted MapLibre style for the OS Maps raster basemap: one
 * raster source pointing at our key-injecting tile proxy and one raster layer.
 * @param {Request} request
 */
export function buildOsBasemapStyle(request) {
  const origin = publicOrigin(request)
  return {
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
}

/**
 * @import { Request } from '@hapi/hapi'
 */
