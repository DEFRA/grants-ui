import { config } from '~/src/config/config.js'
import { invokeGasPostAction } from '../../common/services/grant-application.service.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')
const GAS_FRPS_GRANT_CODE = config.get('landGrants.grantCode')

const mapLandActionsToPayload = (sheetId, parcelId, actionsObj) => ({
  landActions: [
    {
      sheetId,
      parcelId,
      sbi: 117235001,
      actions: mapActionsObjectToPayload(actionsObj)
    }
  ]
})

const mapActionsObjectToPayload = (actionsObj) =>
  Object.entries(actionsObj).map(([code, area]) => ({
    code,
    quantity: Number(area.value)
  }))

/**
 * @typedef {object} LandParcel
 * @property {object} [parcelId] - The parcel identifier
 * @property {object} [sheetId] - The sheet identifier
 */

/**
 * Fetches land grant information from Land Grants API
 * @param {string} parcelId - Land Parcel Id
 * @param {string} sheetId - Sheet Id
 * @returns {Promise<object>} - Promise that resolves to the business details
 * @throws {Error} - If the request fails
 */
export async function fetchLandSheetDetails(parcelId, sheetId) {
  const response = await fetch(
    `${LAND_GRANTS_API_URL}/parcels/${sheetId}-${parcelId}`,
    {
      method: 'GET'
    }
  )

  if (!response.ok) {
    /**
     * @type {Error & {code?: number}}
     */
    const error = new Error(response.statusText)
    error.code = response.status
    throw error
  }

  const data = /** @type {Promise<object>} */ (response.json())

  return data
}

/**
 * Validates action information through Land Grants API
 * @param {string} sheetId - Sheet Id
 * @param {string} parcelId - Land Parcel Id
 * @param {object} actionsObj - Actions object
 * @returns {Promise<object>} - Promise that resolves to the validation result
 * @throws {Error} - If the request fails
 */
export async function validateLandActions(sheetId, parcelId, actionsObj = {}) {
  return invokeGasPostAction(
    GAS_FRPS_GRANT_CODE,
    'validate-land-parcel-actions',
    mapLandActionsToPayload(sheetId, parcelId, actionsObj)
  )
}

/**
 * Calculates application payment information through Land Grants API
 * @param {string} sheetId - Sheet Id
 * @param {string} parcelId - Land Parcel Id
 * @param {object} actionsObj - Actions object
 * @returns {Promise<object>} - Promise that resolves to the payment information
 * @throws {Error} - If the request fails
 */
export async function calculateApplicationPayment(
  sheetId,
  parcelId,
  actionsObj = {}
) {
  const formatAmount = (amount) =>
    amount
      ? new Intl.NumberFormat('en-GB', {
          style: 'currency',
          currency: 'GBP'
        }).format(amount)
      : null

  const response = await fetch(`${LAND_GRANTS_API_URL}/payments/calculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(mapLandActionsToPayload(sheetId, parcelId, actionsObj))
  })

  if (!response.ok) {
    /**
     * @type {Error & {code?: number}}
     */
    const error = new Error(response.statusText)
    error.code = response.status
    throw error
  }

  const data = await response.json()
  const paymentTotal = formatAmount(data.payment?.total)
  return {
    ...data,
    errorMessage:
      paymentTotal == null
        ? 'Error calculating payment. Please try again later.'
        : undefined,
    paymentTotal
  }
}
