import { config } from '~/src/config/config.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')

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
 * Fetches actions information from Land Grants API
 * @param {string} parcelId - Land Parcel Id
 * @param {string} sheetId - Sheet Id
 * @returns {Promise<object>} - Promise that resolves to the business details
 * @throws {Error} - If the request fails
 */
export async function fetchAvailableActionsForParcel(parcelId, sheetId) {
  const response = await fetch(`${LAND_GRANTS_API_URL}/parcels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parcelIds: [`${sheetId}-${parcelId}`],
      fields: ['actions', 'actions.availableArea']
    })
  })

  if (!response.ok) {
    /**
     * @type {Error & {code?: number}}
     */
    const error = new Error(response.statusText)
    error.code = response.status
    throw error
  }

  const data = /** @type {Promise<object>} */ await response.json()
  return data.parcels?.find(
    (p) => p.parcelId === parcelId && p.sheetId === sheetId
  )
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
  const response = await fetch(`${LAND_GRANTS_API_URL}/actions/validate`, {
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

  return response.json()
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
