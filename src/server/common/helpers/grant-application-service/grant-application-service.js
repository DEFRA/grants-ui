import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

const GAS_API_URL = config.get('gas.apiEndpoint')

const logger = createLogger()

/**
 * @typedef {object} LandParcel
 * @property {object} [parcelId] - The parcel identifier
 * @property {object} [sheetId] - The sheet identifier
 */

/**
 * Fetches land grant information from Land Grants API
 * @param {string} parcel - Land Parcel (parcelId-sheetId)
 * @param {string} actions - Actions
 * @param {number} area - Area
 * @returns {Promise<object>} - Promise that resolves to the business details
 * @throws {Error} - If the request fails
 */
export async function submitLandApplication(parcel, actions, area) {
  let response

  try {
    response = await fetch(
      `${GAS_API_URL}/grants/actions/submit-land-application/invoke`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parcel,
          actions: [actions],
          area
        })
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
  } catch (error) {
    logger.error(error, `Failed to send application data for parcel ${parcel}`)
    throw error
  }

  const data = /** @type {Promise<object>} */ (response.json())

  return data
}
