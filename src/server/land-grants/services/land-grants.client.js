import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { config } from '~/src/config/config.js'

/**
 * Performs a POST request to the Land Grants API.
 * @param {string} endpoint
 * @param {object} body
 * @param {string} baseUrl
 * @returns {Promise<Object>}
 * @throws {Error}
 */
export async function postToLandGrantsApi(endpoint, body, baseUrl) {
  const apiOperation = async () => {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: createApiHeadersForLandGrantsBackend(),
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      /**
       * @type {Error & {code?: number, status?: number}}
       */
      const error = new Error(response.statusText)
      error.code = response.status
      error.status = response.status
      throw error
    }

    return response.json()
  }

  return retry(apiOperation, {
    timeout: 30000,
    serviceName: `LandGrantsApi.postTo ${endpoint}`
  })
}

/**
 * Calls the Land Grants API calculate endpoint.
 * @param {{parcel: LandActions[], startDate?: string}} payload
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
  const endpoint = config.get('landGrants.enableSSSIFeature') ? '/api/v2/parcels' : '/parcels'
  return postToLandGrantsApi(endpoint, { parcelIds, fields }, baseUrl)
}

/**
 *
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @returns {Promise<ParcelResponse>}
 */
export async function parcelsWithActionsAndSize(parcelIds, baseUrl) {
  const fields = [
    'actions',
    'size',
    ...(config.get('landGrants.enableSSSIFeature') ? ['actions.sssiConsentRequired'] : [])
  ]
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
  const endpoint = config.get('landGrants.enableSSSIFeature') ? '/api/v2/application/validate' : '/application/validate'
  return postToLandGrantsApi(endpoint, request, baseUrl)
}

/**
 * @import { Parcel, LandActions, ValidateApplicationRequest, ParcelResponse, ValidateApplicationResponse } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import {  PaymentCalculationResponse } from '~/src/server/land-grants/types/payment.d.js'
 */
