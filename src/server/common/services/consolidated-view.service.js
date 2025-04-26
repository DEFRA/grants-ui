import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { getValidToken } from '../helpers/entra/token-manager.js'

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
 * @property {Array}  [data.business.land.parcels] - parcels information
 * @property {string} [data.business.sbi] - Standard Business Identifier
 * @property {string} [data.business.organisationId] - Organisation identifier
 * @property {object} [data.business.customer] - Customer details
 * @property {string} [data.business.customer.firstName] - Customer's first name
 * @property {string} [data.business.customer.lastName] - Customer's last name
 * @property {string} [data.business.customer.role] - Customer's role
 */

class ConsolidatedViewApiError extends Error {
  constructor(message, statusCode, responseBody, sbi, crn) {
    super(message)
    this.name = 'ConsolidatedViewApiError'
    this.code = statusCode
    this.responseBody = responseBody
    this.sbi = sbi
    this.crn = crn
  }
}

/**
 * Fetches business details from Consolidated View
 * @param {number} sbi - Standard Business Identifier
 * @param {number} crn - Customer Reference Number
 * @returns {Promise} - Promise that resolves to the business details
 * @throws {ConsolidatedViewApiError} - If the API request fails
 * @throws {Error} - For other unexpected errors
 */
export async function fetchParcelDataForBusiness(sbi, crn) {
  try {
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
          area
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
    const response = await fetch(CV_API_ENDPOINT, {
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
      const errorText = await response.text()
      throw new ConsolidatedViewApiError(
        `Failed to fetch business data: ${response.status} ${response.statusText}`,
        response.status,
        errorText,
        sbi,
        crn
      )
    }

    return response.json()
  } catch (error) {
    if (error instanceof ConsolidatedViewApiError) {
      logger.error(
        {
          err: error,
          statusCode: error.code,
          responseBody: error.responseBody,
          sbi,
          crn
        },
        `Failed to fetch business data from Consolidated View API`
      )
      throw error
    }

    logger.error(
      { err: error },
      `Unexpected error fetching business data from Consolidated View API`
    )
    throw new ConsolidatedViewApiError(
      'Failed to fetch business data: ' + error.message,
      error.status,
      error.message,
      sbi,
      crn
    )
  }
}
