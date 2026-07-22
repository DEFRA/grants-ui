import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { getConsentTypes } from '~/src/server/land-grants/utils/consent-types.js'

const LAND_GRANTS_SERVICE = 'grants-ui-backend'

/**
 * Performs a POST request to the Land Grants API and returns the raw Response
 * (with its body unread) after retry, error mapping and structured logging.
 * Callers that want JSON use `postToLandGrantsApi`; callers that want binary
 * (e.g. vector tiles) read the body themselves.
 * @param {string} endpoint
 * @param {Record<string, unknown>} body
 * @param {string} baseUrl
 * @returns {Promise<Response>}
 * @throws {Error & {code?: number, status?: number}}
 */
export async function postToLandGrantsApiRaw(endpoint, body, baseUrl) {
  const url = `${baseUrl}${endpoint}`
  log(LogCodes.LAND_GRANTS.API_REQUEST, { endpoint, url })

  let attempts = 0
  /** @type {number | null} */
  let lastUpstreamStatus = null

  const apiOperation = async () => {
    attempts += 1
    const response = await fetch(url, {
      method: 'POST',
      headers: /** @type {HeadersInit} */ (createApiHeadersForLandGrantsBackend()),
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      lastUpstreamStatus = response.status
      let message = response.statusText
      try {
        const responseBody = await response.json()
        message = responseBody?.message ?? message
      } catch {
        // no json found
      }
      logUpstreamError({
        endpoint,
        service: LAND_GRANTS_SERVICE,
        upstreamStatus: response.status,
        errorMessage: message
      })
      /**
       * @type {Error & {code?: number, status?: number}}
       */
      const error = new Error(message)
      error.code = response.status
      error.status = response.status
      throw error
    }

    return response
  }

  return retry(apiOperation, {
    timeout: 30000,
    serviceName: `LandGrantsApi.postTo ${endpoint}`,
    shouldRetry: (error) => {
      const status =
        /** @type {{ code?: number, status?: number }} */ (error)?.code ??
        /** @type {{ code?: number, status?: number }} */ (error)?.status
      return typeof status !== 'number' || status >= statusCodes.internalServerError
    }
  }).catch((error) => {
    logUpstreamError({
      endpoint,
      service: LAND_GRANTS_SERVICE,
      upstreamStatus: error.status ?? error.code ?? lastUpstreamStatus,
      errorMessage: error.message,
      attempts
    })
    throw error
  })
}

/**
 * Performs a POST request to the Land Grants API and parses the JSON body.
 * @template T
 * @param {string} endpoint
 * @param {Record<string, unknown>} body
 * @param {string} baseUrl
 * @returns {Promise<T>}
 * @throws {Error}
 */
export async function postToLandGrantsApi(endpoint, body, baseUrl) {
  const response = await postToLandGrantsApiRaw(endpoint, body, baseUrl)
  return response.json()
}

/**
 * Fetches one MapLibre vector tile ({z}/{x}/{y}) for the given parcels.
 * @param {string[]} parcelIds
 * @param {string | number} z
 * @param {string | number} x
 * @param {string | number} y
 * @param {string} baseUrl
 * @returns {Promise<Buffer>}
 * @throws {Error & {code?: number, status?: number}}
 */
export async function fetchParcelTile(parcelIds, z, x, y, baseUrl) {
  const endpoint = `/api/v1/parcel-tiles/${z}/${x}/${y}`
  const response = await postToLandGrantsApiRaw(endpoint, { parcelIds }, baseUrl)
  const buffer = await response.arrayBuffer()
  return Buffer.from(buffer)
}

/**
 * Calls the Land Grants API calculate endpoint.
 * @param {{parcel: LandActions[], startDate?: string}} payload
 * @param {string} baseUrl
 * @returns {Promise<PaymentCalculationResponse>} - Payment calculation result
 * @throws {Error}
 */
export async function calculate(payload, baseUrl) {
  return postToLandGrantsApi('/api/v2/payments/calculate', payload, baseUrl)
}

/**
 *
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @returns {Promise<ParcelResponse>}
 */
export async function parcelsWithSize(parcelIds, baseUrl) {
  return parcelsWithFields(['size'], parcelIds, baseUrl)
}

/**
 *
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @returns {Promise<ParcelResponse>}
 */
export async function parcelsGroups(parcelIds, baseUrl) {
  return parcelsWithFields(['groups'], parcelIds, baseUrl)
}

/**
 *
 * @param {string[]} fields
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @param {PlannedAction[]} [plannedActions] - When given, the API recomputes each
 *   action's availableArea against these in-progress selections merged with existing
 *   agreements, rather than existing agreements alone.
 * @returns {Promise<ParcelResponse>}
 */
export async function parcelsWithFields(fields, parcelIds, baseUrl, plannedActions = []) {
  const endpoint = '/api/v2/parcels'
  return postToLandGrantsApi(endpoint, { parcelIds, fields, plannedActions }, baseUrl)
}

/**
 *
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @param {PlannedAction[]} [plannedActions] - See parcelsWithFields
 * @returns {Promise<ParcelResponse>}
 */
export async function parcelsWithExtendedInfo(parcelIds, baseUrl, plannedActions) {
  const consentTypes = getConsentTypes()
  const fields = ['actions', 'size', 'groups', ...consentTypes.map((ct) => `actions.${ct.apiField}`)]

  return parcelsWithFields(fields, parcelIds, baseUrl, plannedActions)
}

/**
 * Calls the Land Grants API validate application endpoint.
 * @param {ValidateApplicationRequest} request
 * @param {string} baseUrl
 * @returns {Promise<ValidateApplicationResponse>} - Validation result
 * @throws {Error}
 */
export async function validate(request, baseUrl) {
  const endpoint = '/api/v2/application/validate'
  return postToLandGrantsApi(endpoint, request, baseUrl)
}

/**
 * Returns the bounding box covering the given parcel IDs.
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @returns {Promise<{ bbox: { minLng: number, minLat: number, maxLng: number, maxLat: number } }>}
 * @throws {Error}
 */
export async function locateParcelTiles(parcelIds, baseUrl) {
  return postToLandGrantsApi('/api/v1/parcel-tiles/locate', { parcelIds }, baseUrl)
}

/**
 * @import { Parcel, LandActions, PlannedAction, ValidateApplicationRequest, ParcelResponse, ValidateApplicationResponse } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import {  PaymentCalculationResponse } from '~/src/server/land-grants/types/payment.d.js'
 */
