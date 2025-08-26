import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from '~/src/config/config.js'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

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
 * Creates request options for Consolidated View API calls
 * @param {object} params - Request parameters
 * @param {string} [params.method] - HTTP method
 * @param {string} params.query - GraphQL query string
 * @returns {Promise<object>} Request options object
 */
async function getConsolidatedViewRequestOptions({ method = 'POST', query }) {
  const CV_API_AUTH_EMAIL = config.get('consolidatedView.authEmail')
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getValidToken()}`,
      email: CV_API_AUTH_EMAIL
    },
    body: JSON.stringify({
      query
    })
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
 * Fetches mock data from self-hosted static files
 * @param {number} sbi - Standard Business Identifier
 * @returns {Promise<object>} - Promise that resolves to the mock data
 * @throws {Error} - For file reading errors
 */
async function fetchMockDataForBusiness(sbi) {
  const currentDir = getCurrentDirectory()
  const mockFile = path.join(currentDir, 'land-data', `${sbi}.json`)
  const data = await fs.readFile(mockFile, 'utf8')
  return JSON.parse(data)
}

/**
 * Makes a request to the Consolidated View API
 * @param {string} query - GraphQL query
 * @param {number} sbi - Standard Business Identifier (for error reporting)
 * @returns {Promise<object>} API response JSON
 * @throws {ConsolidatedViewApiError} - If the API request fails
 */
async function makeConsolidatedViewRequest(query, sbi) {
  const CV_API_ENDPOINT = config.get('consolidatedView.apiEndpoint')
  const DAL_SETTINGS = await getConsolidatedViewRequestOptions({ query })

  logger.info(`DAL_SETTINGS: ${JSON.stringify(DAL_SETTINGS)}`)

  const response = await fetch(CV_API_ENDPOINT, DAL_SETTINGS)

  if (!response.ok) {
    const errorText = await response.text()
    throw new ConsolidatedViewApiError(
      `Failed to fetch business data: ${response.status} ${response.statusText}`,
      response.status,
      errorText,
      sbi
    )
  }

  return response.json()
}

/**
 * Generic function to fetch data from Consolidated View with mock support
 * @param {object} params - Request parameters
 * @param {number} params.sbi - Standard Business Identifier
 * @param {string} params.query - GraphQL query
 * @param {Function} params.formatResponse - Function to format the response
 * @returns {Promise<any>} Formatted response data
 * @throws {ConsolidatedViewApiError} - If the API request fails
 */
async function fetchFromConsolidatedView({ sbi, query, formatResponse }) {
  const mockDALEnabled = config.get('consolidatedView.mockDALEnabled')

  try {
    if (mockDALEnabled) {
      const mockResponse = await fetchMockDataForBusiness(sbi)
      return formatResponse(mockResponse)
    }

    logger.info(`Get REAL DAL Data for SBI: ${sbi}`)
    const responseJson = await makeConsolidatedViewRequest(query, sbi)
    return formatResponse(responseJson)
  } catch (error) {
    logger.error({ err: error }, `Unexpected error fetching business data from Consolidated View API`)
    throw new ConsolidatedViewApiError(
      'Failed to fetch business data: ' + error.message,
      error.status,
      error.message,
      sbi
    )
  }
}

/**
 * Fetches business parcels data from Consolidated View
 * @param {number} sbi - Standard Business Identifier
 * @returns {Promise<Array>} - Promise that resolves to the parcels array
 * @throws {ConsolidatedViewApiError} - If the API request fails
 * @throws {Error} - For other unexpected errors
 */
export async function fetchParcelsForSbi(sbi) {
  const query = `
    query Business {
      business(sbi: "${sbi}") {
        land {
          parcels(date: "${new Date().toISOString()}") {
            parcelId
            sheetId
          }
        }
      }
    }`

  const formatResponse = (r) => r.data?.business?.land?.parcels || []
  return fetchFromConsolidatedView({ sbi, query, formatResponse })
}

/**
 * Fetches business and customer information from Consolidated View
 * @param {number} sbi - Standard Business Identifier
 * @param {string} crn - Customer Reference Number
 * @returns {Promise<object>} - Promise that resolves to business and customer info
 * @throws {ConsolidatedViewApiError} - If the API request fails
 * @throws {Error} - For other unexpected errors
 */
export async function fetchBusinessAndCustomerInformation(sbi, crn) {
  const query = `
    query Business {
      customer(crn: "${crn}") {
        info {
          name {
            title
            first
            middle
            last
          }
        }
      }
      business(sbi: "${sbi}") {
        info {
          email {
            address
          }
          phone {
            mobile
          }
          name
          address {
            line1
            line2
            line3
            line4
            line5
            street
            city
            postalCode
          }
        }
      }
    }`

  const formatResponse = (r) => ({
    business: r.data?.business?.info,
    customer: r.data?.customer?.info
  })

  return fetchFromConsolidatedView({ sbi, query, formatResponse })
}
