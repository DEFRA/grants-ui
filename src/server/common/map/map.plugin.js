import { config } from '~/src/config/config.js'
import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { fetchParcels, fetchParcelTileLocation } from '~/src/server/land-grants/services/land-grants.service.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { isMockData, buildMockFeatures } from './map.mock.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')

/**
 * @typedef {import('~/src/server/land-grants/types/land-grants.client.d.js').Parcel & {
 *   area?: { value?: number | null, unit?: string }
 * }} HydratedParcel
 *
 * @typedef {object} ParcelFeature
 * @property {string} id
 * @property {{ id: string, sheet_id: string, parcel_id: string, areaHa: number|null }} properties
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
          /** @type {HydratedParcel[]} */
          let parcels = []
          try {
            parcels = /** @type {HydratedParcel[]} */ (
              await fetchParcels(
                /** @type {import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} */ (
                  /** @type {unknown} */ (request)
                )
              )
            )
          } catch {
            return h.response({ error: 'unavailable' }).code(statusCodes.serviceUnavailable)
          }

          const parcelData = parcels.map((p) => ({
            id: stringifyParcel(p),
            sheetId: p.sheetId,
            parcelId: p.parcelId,
            areaHa: p.area?.value == null ? null : Number(p.area.value)
          }))

          if (isMockData()) {
            const { features, bbox } = buildMockFeatures(parcelData)
            request.yar.set('mapMockFeatures', features)
            return h
              .response({ features, bbox, tileUrl: null, geojsonUrl: '/api/map/parcels/geojson' })
              .code(statusCodes.ok)
          }

          const features = parcelData.map((p) => ({
            type: 'Feature',
            id: p.id,
            properties: { id: p.id, sheetId: p.sheetId, parcelId: p.parcelId, areaHa: p.areaHa }
          }))
          const parcelIds = parcelData.map((p) => p.id)
          const bbox = await fetchParcelTileLocation(parcelIds).catch(() => null)
          request.yar.set('mapParcelIds', parcelIds)
          const tileUrl = parcelIds.length > 0 ? '/land-grants/parcel-tiles/{z}/{x}/{y}' : null

          return h.response({ features, bbox, tileUrl }).code(statusCodes.ok)
        }
      })

      server.route({
        method: 'GET',
        path: '/api/map/parcels/geojson',
        options: { auth: false },
        handler: (request, h) => {
          if (!isMockData()) {
            return h.response({ error: 'not found' }).code(statusCodes.notFound)
          }
          const features = /** @type {import('./map.plugin.js').ParcelFeature[] | null} */ (
            request.yar.get('mapMockFeatures')
          )
          if (!features) {
            return h.response({ error: 'not found' }).code(statusCodes.notFound)
          }
          return h.response({ type: 'FeatureCollection', features }).code(statusCodes.ok)
        }
      })

      server.route({
        method: 'GET',
        path: '/land-grants/parcel-tiles/{z}/{x}/{y}',
        options: { auth: false },
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
          return h
            .response(Buffer.from(buffer))
            .code(statusCodes.ok)
            .type('application/x-protobuf')
            .header('Cache-Control', 'public, max-age=3600')
        }
      })
    }
  }
}
