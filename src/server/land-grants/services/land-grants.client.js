import { config } from '~/src/config/config.js'
import { createAuthenticatedHeaders } from '../../common/helpers/state/backend-auth-helper.js'

const CONTENT_TYPE_JSON = 'application/json'

/**
 * Creates standard headers for API requests to grants-ui-backend
 * @returns {object} Headers with Content-Type and authentication
 */
function createApiHeadersForLandGrantsApi() {
  const landGrantsApiToken = config.get('landGrants.authToken')
  const encryptionKey = config.get('landGrants.encryptionKey')
  return createAuthenticatedHeaders(landGrantsApiToken, encryptionKey, {
    'Content-Type': CONTENT_TYPE_JSON
  })
}

/**
 * Performs a POST request to the Land Grants API.
 * @param {string} endpoint
 * @param {object} body
 * @param {string} baseUrl
 * @returns {Promise<Object>}
 * @throws {Error}
 */
export async function postToLandGrantsApi(endpoint, body, baseUrl) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: createApiHeadersForLandGrantsApi(),
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    /**
     * @type {Error & {code?: number}}
     */
    const error = new Error(response.statusText)
    error.code = response.status
    throw error
  }

  return response.json()
}

/**
 * Calls the Land Grants API calculate endpoint.
 * @param {{landActions: LandActions[]}} payload
 * @param {string} baseUrl
 * @returns {Promise<PaymentCalculationResponse>} - Payment calculation result
 * @throws {Error}
 */
export async function calculate(payload, baseUrl) {
  return postToLandGrantsApi('/payments/calculate', payload, baseUrl)
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
 * @param {string[]} fields
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @returns {Promise<ParcelResponse>}
 */
export async function parcelsWithFields(fields, parcelIds, baseUrl) {
  return postToLandGrantsApi('/parcels', { parcelIds, fields }, baseUrl)
}

/**
 *
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @returns {Promise<ParcelResponse>}
 */
export async function parcelsWithActionsAndSize(parcelIds, baseUrl) {
  return parcelsWithFields(['actions', 'size'], parcelIds, baseUrl)
}

/**
 * Calls the Land Grants API validate application endpoint.
 * @param {ValidateApplicationRequest} request
 * @param {string} baseUrl
 * @returns {Promise<ValidateApplicationResponse>} - Validation result
 * @throws {Error}
 */
export async function validate(request, baseUrl) {
  return postToLandGrantsApi('/application/validate', request, baseUrl)
}

/**
 * @import { Parcel, LandActions, ValidateApplicationRequest, ParcelResponse, ValidateApplicationResponse } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import {  PaymentCalculationResponse } from '~/src/server/land-grants/types/payment.d.js'
 */
