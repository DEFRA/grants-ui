import { config } from '~/src/config/config.js'
import {
  invokeGasGetAction,
  invokeGasPostAction
} from '../../common/services/grant-application.service.js'

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
  return invokeGasGetAction({
    grantCode: GAS_FRPS_GRANT_CODE,
    actionName: 'get-land-parcel-data',
    queryString: `parcelId=${sheetId}-${parcelId}`
  })
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
  return invokeGasPostAction({
    grantCode: GAS_FRPS_GRANT_CODE,
    actionName: 'validate-land-parcel-actions',
    payload: mapLandActionsToPayload(sheetId, parcelId, actionsObj)
  })
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

  const data = await invokeGasPostAction({
    grantCode: GAS_FRPS_GRANT_CODE,
    actionName: 'calculate-payment',
    payload: mapLandActionsToPayload(sheetId, parcelId, actionsObj)
  })

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
