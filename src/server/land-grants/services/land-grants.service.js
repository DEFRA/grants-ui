import { config } from '~/src/config/config.js'

const LAND_GRANTS_API_URL = config.get('landGrants.apiEndpoint')

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
    `${LAND_GRANTS_API_URL}/parcel/${sheetId}-${parcelId}`,
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

  const response = await fetch(`${LAND_GRANTS_API_URL}/calculate/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      landActions: {
        sheetId,
        parcelId,
        sbi: 117235001,
        actions: Object.entries(actionsObj).map(([code, area]) => ({
          actionId: code,
          area: area.value
        }))
      }
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

  const data = await response.json()
  return {
    ...data,
    paymentTotal: formatAmount(data.payment?.total)
  }
}
