import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

const LAND_GRANTS_API_URL = config.get('landGrants.apiEndpoint')

const logger = createLogger()

/**
 * @typedef {object} LandParcel
 * @property {object} [parcelId] - The parcel identifier
 * @property {object} [sheetId] - The sheet identifier
 */

/**
 * Fetches land grant information from Land Grants API
 * @param {number} parcelId - Land Parcel Id
 * @param {number} sheetId - Sheet Id
 * @returns {Promise<object>} - Promise that resolves to the business details
 * @throws {Error} - If the request fails
 */
export async function fetchLandSheetDetails(parcelId, sheetId) {
  let response

  try {
    response = await fetch(
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
  } catch (error) {
    logger.error(
      error,
      `Failed to fetch land parcel data for id ${sheetId}-${parcelId}`
    )
    throw error
  }

  const data = /** @type {Promise<object>} */ (response.json())

  return data
}
