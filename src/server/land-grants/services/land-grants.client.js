import { createApiHeadersForLandGrantsBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { getConsentTypes } from '~/src/server/land-grants/utils/consent-types.js'

/**
 * Performs a POST request to the Land Grants API.
 * @param {string} endpoint
 * @param {object} body
 * @param {string} baseUrl
 * @returns {Promise<Object>}
 * @throws {Error}
 */
export async function postToLandGrantsApi(endpoint, body, baseUrl) {
  const url = `${baseUrl}${endpoint}`
  log(LogCodes.LAND_GRANTS.API_REQUEST, { endpoint, url })

  const apiOperation = async () => {
    const response = await fetch(url, {
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
 * Calls the Land Grants API calculate-wmp endpoint.
 * @param {{ parcelIds: string[], youngWoodlandArea: number, oldWoodlandArea: number }} payload
 * @param {string} baseUrl
 * @returns {Promise<{ result: string }>}
 * @throws {Error}
 */
export async function calculateWmp(payload, baseUrl) {
  return postToLandGrantsApi('/api/v2/payments/calculate-wmp', payload, baseUrl)
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
 * @import { Parcel, LandActions, ValidateApplicationRequest, ParcelResponse, ValidateApplicationResponse } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import {  PaymentCalculationResponse } from '~/src/server/land-grants/types/payment.d.js'
 */
