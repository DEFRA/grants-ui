import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { getConsentTypes } from '~/src/server/land-grants/utils/consent-types.js'

const LAND_GRANTS_SERVICE = 'grants-ui-backend'

/**
 * Performs a POST request to the Land Grants API.
 * @template T
 * @param {string} endpoint
 * @param {Record<string, unknown>} body
 * @param {string} baseUrl
 * @returns {Promise<T>}
 * @throws {Error}
 */
export async function postToLandGrantsApi(endpoint, body, baseUrl) {
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

    return response.json()
  }

  const result = await retry(apiOperation, {
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

  return result
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
 * @returns {Promise<ParcelResponse>}
 */
export async function parcelsWithFields(fields, parcelIds, baseUrl) {
  const endpoint = '/api/v2/parcels'
  return postToLandGrantsApi(endpoint, { parcelIds, fields }, baseUrl)
}

/**
 *
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @returns {Promise<ParcelResponse>}
 */
export async function parcelsWithExtendedInfo(parcelIds, baseUrl) {
  const consentTypes = getConsentTypes()
  const fields = ['actions', 'size', 'groups', ...consentTypes.map((ct) => `actions.${ct.apiField}`)]

  return parcelsWithFields(fields, parcelIds, baseUrl)
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
 * @import { Parcel, LandActions, ValidateApplicationRequest, ParcelResponse, ValidateApplicationResponse } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import {  PaymentCalculationResponse } from '~/src/server/land-grants/types/payment.d.js'
 */
