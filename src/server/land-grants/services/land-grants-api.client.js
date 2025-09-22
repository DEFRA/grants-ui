/**
 * Performs a POST request to the Land Grants API.
 * @param {string} endpoint
 * @param {object} body
 * @param {string} baseUrl
 * @returns {Promise<any>}
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
 * @param {LandActions[]} landParcel
 * @param {string} baseUrl
 * @returns {Promise<PaymentCalculationResponse>} - Payment calculation result
 * @throws {Error}
 */
async function calculate(landParcel, baseUrl) {
  return await postToLandGrantsApi('/payments/calculate', landParcel, baseUrl)
}

/**
 *
 * @param {string[]} parcelIds
 * @param {string} baseUrl
 * @returns {Promise<{parcels: Parcel[]}>}
 */
async function parcelsWithSize(parcelIds, baseUrl) {
  return await postToLandGrantsApi(
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
 * @returns {Promise<Parcel[]>}
 */
async function parcelsWithActionsAndSize(parcelIds, baseUrl) {
  return await postToLandGrantsApi(
    '/parcels',
    {
      parcelIds,
      fields: ['actions', 'size']
    },
    baseUrl
  )
}

/**
 * Calls the Land Grants API validate actions endpoint.
 * @param {LandActions} landActions
 * @param {string} baseUrl
 * @returns {Promise<any>} - Validation result
 * @throws {Error}
 */
async function validate(landActions, baseUrl) {
  return await postToLandGrantsApi('/actions/validate', { landActions }, baseUrl)
}

/**
 * Calls the Land Grants API validate application endpoint.
 * @param {ValidateApplicationRequest} request
 * @param {string} baseUrl
 * @returns {Promise<any>} - Validation result
 * @throws {Error}
 */
async function validateApplication(request, baseUrl) {
  return await postToLandGrantsApi('/application/validate', request, baseUrl)
}

/**
 * Creates a Land Grants API client.
 * @param {string} baseUrl
 * @returns
 */
export function createLandGrantsApiClient(baseUrl) {
  return {
    /** @param {LandActions[]} landActions */
    calculate: (landActions) => calculate(landActions, baseUrl),
    /** @param {string[]} parcelIds */
    parcelsWithSize: (parcelIds) => parcelsWithSize(parcelIds, baseUrl),
    /** @param {string[]} parcelIds */
    parcelsWithActionsAndSize: (parcelIds) => parcelsWithActionsAndSize(parcelIds, baseUrl),
    /** @param {LandActions} landActions */
    validateActions: (landActions) => validate(landActions, baseUrl),
    /** @param {ValidateApplicationRequest} request */
    validateApplication: (request) => validateApplication(request, baseUrl)
  }
}

/**
 * @import { Parcel, LandActions, PaymentCalculationResponse, Action, ValidateApplicationRequest } from './land-grants-api-client.d.js'
 */
