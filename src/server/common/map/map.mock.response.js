import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { buildMockFeatures } from './map.mock.js'

/**
 * Mock-mode parcels response. Embeds real polygon geometry (via buildMockFeatures)
 * directly in the response, flagged `mock: true` so the client renders it as an
 * inline GeoJSON source instead of pointing MapLibre at the vector-tile route.
 *
 * Lives here, not in the production parcels handler, so the 173KB-sourced geometry
 * can never execute on a real code path — only called when `isMockData()`.
 * @param {{ id: string, sheetId: string, parcelId: string, areaHa: number | null }[]} parcelData
 * @param {ResponseToolkit} h
 */
export function buildMockParcelsResponse(parcelData, h) {
  const mockResult = buildMockFeatures(parcelData)
  return h
    .response({
      features: mockResult.features,
      bbox: mockResult.bbox,
      mock: true
    })
    .code(statusCodes.ok)
}

/**
 * @import { ResponseToolkit } from '@hapi/hapi'
 */
