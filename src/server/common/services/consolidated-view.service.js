import { config } from '~/src/config/config.js'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

const CV_API_ENDPOINT = config.get('consolidatedView.apiEndpoint')
const CV_API_AUTH_EMAIL = config.get('consolidatedView.authEmail')

const logger = createLogger()

/**
 * @typedef {object} LandParcel
 * @property {object} [parcelId] - The parcel identifier
 * @property {object} [sheetId] - The sheet identifier
 */

/**
 * @typedef {object} BusinessResponse
 * @property {object} [data] - The response data object
 * @property {object} [data.business] - Business information
 * @property {object} [data.business.land] - Land information
 * @property {Array<LandParcel>} [data.business.land.parcels] - parcels information
 * @property {string} [data.business.sbi] - Standard Business Identifier
 * @property {string} [data.business.organisationId] - Organisation identifier
 * @property {object} [data.business.customer] - Customer details
 * @property {string} [data.business.customer.firstName] - Customer's first name
 * @property {string} [data.business.customer.lastName] - Customer's last name
 * @property {string} [data.business.customer.role] - Customer's role
 */

/**
 * Fetches business details from Consolidated View
 * @param {number} sbi - Standard Business Identifier
 * @param {number} crn - Customer Reference Number
 * @returns {Promise<BusinessResponse>} - Promise that resolves to the business details
 * @throws {Error} - If the request fails
 */
export async function fetchBusinessDetails(sbi, crn) {
  let response
  const now = new Date().toISOString()
  const query = `
    query Business {
      business(sbi: "${sbi}") {
        sbi
        organisationId
        land {
          parcels(date: "${now}") {
            parcelId
            sheetId
          }
        }
        customer(crn: "${crn}") {
            firstName
            lastName
            role
        }
      }
    }`

  const token = await getValidToken()

  try {
    response = await fetch(CV_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        email: CV_API_AUTH_EMAIL
      },
      body: JSON.stringify({
        query
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
  } catch (error) {
    logger.error(error, `Failed to fetch business details for sbi ${sbi}`)
    throw error
  }

  const data = /** @type {Promise<BusinessResponse>} */ (response.json())

  return data
}
