import { config } from '~/src/config/config.js'
import {
  invokeGasGetAction,
  invokeGasPostAction
} from '~/src/server/common/services/grant-application.service.js'

const GRANT_CODE = config.get('landGrants.grantCode')

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
 * Fetches land grant information
 * @param {string} parcelId - Land Parcel Id
 * @param {string} sheetId - Sheet Id
 * @returns {Promise<object>} - Promise that resolves to the business details
 * @throws {Error} - If the request fails
 */
export async function fetchLandSheetDetails(parcelId, sheetId) {
  return invokeGasGetAction(GRANT_CODE, 'get-parcel-details', {
    parcelId: `${sheetId}-${parcelId}`
  })
}

/**
 * Validates action information
 * @param {string} sheetId - Sheet Id
 * @param {string} parcelId - Land Parcel Id
 * @param {object} actionsObj - Actions object
 * @returns {Promise<object>} - Promise that resolves to the validation result
 * @throws {Error} - If the request fails
 */
export async function validateLandActions(sheetId, parcelId, actionsObj = {}) {
  const payload = mapLandActionsToPayload(sheetId, parcelId, actionsObj)
  return invokeGasPostAction(GRANT_CODE, 'validate-actions', payload)
}

/**
 * Calculates application payment information
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

  const payload = mapLandActionsToPayload(sheetId, parcelId, actionsObj)
  const data = await invokeGasPostAction(
    GRANT_CODE,
    'calculate-payment',
    payload
  )

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
