import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
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
 * @property {Array}  [data.business.land.parcels] - parcels information
 * @property {string} [data.business.sbi] - Standard Business Identifier
 * @property {string} [data.business.organisationId] - Organisation identifier
 * @property {object} [data.business.customer] - Customer details
 * @property {string} [data.business.customer.firstName] - Customer's first name
 * @property {string} [data.business.customer.lastName] - Customer's last name
 * @property {string} [data.business.customer.role] - Customer's role
 */

class ConsolidatedViewApiError extends Error {
  constructor(message, statusCode, responseBody, sbi) {
    super(message)
    this.name = 'ConsolidatedViewApiError'
    this.status = statusCode
    this.responseBody = responseBody
    this.sbi = sbi
  }
}

/**
 * Get the directory name for the current module
 * @returns {string} Directory path
 */
function getCurrentDirectory() {
  const currentFilePath = fileURLToPath(import.meta.url)
  return path.dirname(currentFilePath)
}

/**
 * Fetches business details from self hosted static land data
 * @param {number} sbi - Standard Business Identifier
 * @returns {Promise} - Promise that resolves to the business details
 * @throws {Error} - For unexpected errors
 */
async function fetchMockParcelDataForBusiness(sbi) {
  const currentDir = getCurrentDirectory()
  const mockFile = path.join(currentDir, 'land-data', `${sbi}.json`)
  const data = await fs.readFile(mockFile, 'utf8')
  return JSON.parse(data)
}

/**
 * Fetches business details from Consolidated View
 * @param {number} sbi - Standard Business Identifier
 * @returns {Promise} - Promise that resolves to the business details
 * @throws {ConsolidatedViewApiError} - If the API request fails
 * @throws {Error} - For other unexpected errors
 */
export async function fetchParcelsForSbi(sbi) {
  const mockDALEnabled = config.get('consolidatedView.mockDALEnabled')
  const formatResponse = (response) =>
    response.data?.business?.land?.parcels || []

  try {
    if (mockDALEnabled) {
      const response = await fetchMockParcelDataForBusiness(sbi)
      return formatResponse(response)
    }

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
        sbi
      )
    }

    const responseJson = await response.json()
    return formatResponse(responseJson)
  } catch (error) {
    logger.error(
      { err: error },
      `Unexpected error fetching business data from Consolidated View API`
    )
    throw new ConsolidatedViewApiError(
      'Failed to fetch business data: ' + error.message,
      error.status,
      error.message,
      sbi
    )
  }
}
