import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
 * @param {AnyFormRequest} request
 * @param {object} params - Request parameters
 * @param {string} [params.method] - HTTP method
 * @param {string} params.query - GraphQL query string
 * @returns {Promise<object>} Request options object
 */
async function getConsolidatedViewRequestOptions(request, { method = 'POST', query }) {
  const isDefraIdEnabled = config.get('defraId.enabled')
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await getValidToken()}`
  }

  if (isDefraIdEnabled) {
    const { credentials: { token } = {} } = request.auth ?? {}
    headers['gateway-type'] = 'external'
    headers['x-forwarded-authorization'] = token
  } else {
    headers['email'] = config.get('consolidatedView.authEmail')
  }

  return {
    method,
    headers,
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
 * @param {AnyFormRequest} request
 * @param {string} query - GraphQL query
 * @returns {Promise<object>} API response JSON
 * @throws {ConsolidatedViewApiError} - If the API request fails
 */
async function makeConsolidatedViewRequest(request, query) {
  const sbi = request.auth.credentials.sbi
  const CV_API_ENDPOINT = config.get('consolidatedView.apiEndpoint')
  const response = await fetch(CV_API_ENDPOINT, await getConsolidatedViewRequestOptions(request, { query }))

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
 * @param {AnyFormRequest} request
 * @param {object} params - Request parameters
 * @param {string} params.query - GraphQL query
 * @param {Function} params.formatResponse - Function to format the response
 * @returns {Promise<any>} Formatted response data
 * @throws {ConsolidatedViewApiError} - If the API request fails
 */
async function fetchFromConsolidatedView(request, { query, formatResponse }) {
  const mockDALEnabled = config.get('consolidatedView.mockDALEnabled')
  const { credentials: { sbi } = {} } = request.auth ?? {}

  try {
    if (mockDALEnabled) {
      const mockResponse = await fetchMockDataForBusiness(sbi)
      return formatResponse(mockResponse)
    }

    const responseJson = await makeConsolidatedViewRequest(request, query)

    logger.info('Consolidated View Response: ' + JSON.stringify(responseJson))
    return formatResponse(responseJson)
  } catch (error) {
    logger.error({ err: error }, 'Unexpected error fetching business data from Consolidated View API')
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
 * @param {AnyFormRequest} request
 * @returns {Promise<Array>} - Promise that resolves to the parcels array
 * @throws {ConsolidatedViewApiError} - If the API request fails
 * @throws {Error} - For other unexpected errors
 */
export async function fetchParcelsFromDal(request) {
  const { credentials: { sbi } = {} } = request.auth ?? {}
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
  return fetchFromConsolidatedView(request, { query, formatResponse })
}

/**
 * Fetches business and customer information from Consolidated View
 * @param {AnyFormRequest} request
 * @returns {Promise<object>} - Promise that resolves to business and customer info
 * @throws {ConsolidatedViewApiError} - If the API request fails
 * @throws {Error} - For other unexpected errors
 */
export async function fetchBusinessAndCustomerInformation(request) {
  const { credentials: { sbi, crn } = {} } = request.auth ?? {}
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
          reference
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

  return fetchFromConsolidatedView(request, { query, formatResponse })
}

export async function fetchBusinessAndCPH(request) {
  const { credentials: { sbi, crn } = {} } = request.auth ?? {}

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
          reference
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
          vat
          type {
            code
            type
          }
        }
        countyParishHoldings {
            cphNumber
        }
      }
    }`

  const formatResponse = (r) => ({
    business: r.data?.business?.info,
    countyParishHoldings: r.data?.business.countyParishHoldings[0].cphNumber, // just selecting the first cphNumber for demo purposes
    customer: r.data?.customer?.info
  })

  return fetchFromConsolidatedView(request, { query, formatResponse })
}

/**
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
