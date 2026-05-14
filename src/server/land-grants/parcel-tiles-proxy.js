import { config } from '~/src/config/config.js'
import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { getCachedTileParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')

/**
 * Hapi plugin that proxies GET /land-grants/parcel-tiles/{z}/{x}/{y}
 * to the Land Grants API tile endpoint as a POST with parcelIds.
 *
 * parcelIds are stored in the server-side cache (keyed by SBI) when the map
 * page loads — this avoids encoding them in the URL (which breaks for large farms)
 * and avoids relying on MapLibre's transformRequest which doesn't work when set
 * after map construction.
 *
 * @satisfies {import('@hapi/hapi').ServerRegisterPluginObject<void>}
 */
export const parcelTilesProxy = {
  plugin: {
    name: 'parcel-tiles-proxy',
    register(server) {
      server.route({
        method: 'GET',
        path: '/land-grants/parcel-tiles/{z}/{x}/{y}',
        options: {},
        handler: async (request, h) => {
          const { z, x, y } = request.params
          const upstream = `${LAND_GRANTS_API_URL}/api/v1/parcel-tiles/${z}/${x}/${y}`

          const sbi = request.auth?.credentials?.sbi ?? 'spike'
          const parcelIds = getCachedTileParcelIds(sbi) ?? []

          const response = await fetch(upstream, {
            method: 'POST',
            headers: {
              .../** @type {Record<string,string>} */ (createApiHeadersForLandGrantsBackend()),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ parcelIds })
          })

          if (!response.ok) {
            return h.response().code(response.status)
          }

          const buffer = await response.arrayBuffer()
          return h
            .response(Buffer.from(buffer))
            .code(200)
            .type('application/x-protobuf')
        }
      })
    }
  }
}
