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
    headers: {
      'Content-Type': 'application/json'
    },
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
 * @returns {Promise<{parcels: Parcel[]}>}
 */
export async function parcelsWithSize(parcelIds, baseUrl) {
  return postToLandGrantsApi(
    '/parcels',
    {
      parcelIds,
      fields: ['size']
    },
    baseUrl
  )
}

/**
 *
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @returns {Promise<ParcelResponse>}
 */
export async function parcelsWithActionsAndSize(parcelIds, baseUrl) {
  return postToLandGrantsApi(
    '/parcels',
    {
      parcelIds,
      fields: ['actions', 'size']
    },
    baseUrl
  )
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
