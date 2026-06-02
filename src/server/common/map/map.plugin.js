import { config } from '~/src/config/config.js'
import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { fetchParcels, fetchParcelTileLocation } from '~/src/server/land-grants/services/land-grants.service.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')

/**
 * @typedef {import('~/src/server/land-grants/types/land-grants.client.d.js').Parcel & {
 *   area?: { value?: number | null, unit?: string }
 * }} HydratedParcel
 *
 * @typedef {object} ParcelFeature
 * @property {string} id
 * @property {{ id: string, sheetId: string, parcelId: string, areaHa: number|null }} properties
 */

/** @satisfies {import('@hapi/hapi').ServerRegisterPluginObject<void>} */
export const mapPlugin = {
  plugin: {
    name: 'map',
    register(server) {
      server.route({
        method: 'GET',
        path: '/api/map/parcels',
        options: { auth: { mode: 'required', strategy: 'session' } },
        handler: async (request, h) => {
          /** @type {ParcelFeature[]} */
          let features = []
          try {
            const parcels = /** @type {HydratedParcel[]} */ (
              await fetchParcels(
                /** @type {import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} */ (
                  /** @type {unknown} */ (request)
                )
              )
            )
            features = parcels.map((p) => {
              const id = stringifyParcel(p)
              return {
                type: 'Feature',
                id,
                properties: {
                  id,
                  sheetId: p.sheetId,
                  parcelId: p.parcelId,
                  areaHa: p.area?.value == null ? null : Number(p.area.value)
                }
              }
            })
          } catch {
            return h.response({ error: 'unavailable' }).code(statusCodes.serviceUnavailable)
          }

          const parcelIds = features.map((f) => f.id)
          const bbox = await fetchParcelTileLocation(parcelIds).catch(() => null)

          request.yar.set('mapParcelIds', parcelIds)
          const tileUrl = parcelIds.length > 0 ? '/land-grants/parcel-tiles/{z}/{x}/{y}' : null

          return h.response({ features, bbox, tileUrl }).code(statusCodes.ok)
        }
      })

      server.route({
        method: 'GET',
        path: '/land-grants/parcel-tiles/{z}/{x}/{y}',
        options: {},
        handler: async (request, h) => {
          const { z, x, y } = request.params
          const parcelIds = /** @type {string[]} */ (request.yar.get('mapParcelIds') ?? [])

          const upstream = `${LAND_GRANTS_API_URL}/api/v1/parcel-tiles/${z}/${x}/${y}`

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
          return h.response(Buffer.from(buffer)).code(statusCodes.ok).type('application/x-protobuf')
        }
      })
    }
  }
}
