/**
 * Extract selected parcel IDs from a request payload. Handles both the map
 * path (hidden inputs, arriving as an array) and the radio/checkbox no-JS
 * fallback (a single string). Non-string values are filtered out, so callers
 * never have to re-validate the raw payload.
 * @param {AnyFormRequest} request
 * @returns {string[]}
 */
export function getParcelIdsFromPayload(request) {
  const landParcels = /** @type {Record<string, unknown> | undefined} */ (request.payload)?.landParcels
  if (Array.isArray(landParcels)) {
    return /** @type {string[]} */ (landParcels.filter((v) => typeof v === 'string'))
  }
  if (typeof landParcels === 'string' && landParcels) {
    return [landParcels]
  }
  return []
}

/**
 * @param {AnyFormRequest} request
 * @returns {string[]}
 */
export function getParcelIdFromQuery(request) {
  const parcelId = /** @type {Record<string, unknown> | undefined} */ (request?.query)?.parcelId
  return parcelId ? [/** @type {string} */ (parcelId)] : []
}

/**
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
