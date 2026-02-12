import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '~/src/config/config.js'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import { escapeGraphQLString } from '~/src/server/common/helpers/graphql-utils.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

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

export class ConsolidatedViewApiError extends Error {
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
  const { credentials: { token } = {} } = request.auth ?? {}

  const headers = {
    'Content-Type': 'application/json',
    'gateway-type': 'external',
    'x-forwarded-authorization': token,
    Authorization: `Bearer ${await getValidToken()}`
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
 * @param {number} sbi - Single Business Identifier
 * @param {number} crn - Customer Reference Number
 * @returns {Promise<object>} - Promise that resolves to the mock data
 * @throws {Error} - For file reading errors
 */
async function fetchMockDataForBusiness(sbi, crn) {
  const currentDir = getCurrentDirectory()
  const mockSBIFile = path.join(currentDir, 'land-data', `${sbi}.json`)
  const sbiData = await fs.readFile(mockSBIFile, 'utf8')
  const mockCRNFile = path.join(currentDir, 'crn-data', `${crn}.json`)
  const crnData = await fs.readFile(mockCRNFile, 'utf8')

  const mockDALResponse = JSON.parse(sbiData)
  Object.assign(mockDALResponse.data, JSON.parse(crnData))

  return mockDALResponse
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

  const fetchOperation = async () => {
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

  return retry(fetchOperation, {
    timeout: 30000,
    serviceName: 'ConsolidatedView.fetchBusinessData'
  })
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
  const { credentials: { sbi, crn } = {} } = request.auth ?? {}

  try {
    if (mockDALEnabled) {
      const mockResponse = await fetchMockDataForBusiness(sbi, crn)
      return formatResponse(mockResponse)
    }

    const responseJson = await makeConsolidatedViewRequest(request, query)
    return formatResponse(responseJson)
  } catch (error) {
    log(
      LogCodes.SYSTEM.CONSOLIDATED_VIEW_API_ERROR,
      {
        sbi,
        errorMessage: error.message
      },
      request
    )
    throw new ConsolidatedViewApiError(error.message, error.status, error.message, sbi)
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
      business(sbi: "${escapeGraphQLString(sbi)}") {
        land {
          parcels(date: "${escapeGraphQLString(new Date().toISOString())}") {
            parcelId
            sheetId
          }
        }
      }
    }`

  const formatResponse = (r) => r.data?.business?.land?.parcels || []
  return fetchFromConsolidatedView(request, { query, formatResponse })
}

function formatAddress(sbi, address) {
  const commonFields = {
    city: address.city,
    postalCode: address.postalCode
  }

  log(LogCodes.SYSTEM.CONSOLIDATED_VIEW_ADDRESS_FORMAT, {
    sbi,
    uprn: address.uprn
  })

  if (address.uprn) {
    const { flatName, buildingName, buildingNumberRange, street, dependentLocality, doubleDependentLocality } = address
    const buildingParts = [flatName, buildingName, buildingNumberRange, street].filter(Boolean)
    const buildingLine = buildingParts.length > 0 ? buildingParts.join(' ') : null

    const [line1, line2, line3, line4] = [
      address.pafOrganisationName,
      buildingLine,
      dependentLocality,
      doubleDependentLocality
    ].filter(Boolean)

    return {
      ...commonFields,
      line1,
      line2,
      line3,
      line4
    }
  }

  return {
    ...commonFields,
    line1: address.line1,
    line2: address.line2,
    line3: address.line3,
    line4: address.line4
  }
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
      customer(crn: "${escapeGraphQLString(crn)}") {
        info {
          name {
            title
            first
            middle
            last
          }
        }
      }
      business(sbi: "${escapeGraphQLString(sbi)}") {
        info {
          reference
          email {
            address
          }
          phone {
            mobile
            landline
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
            uprn
            county
            buildingName
            buildingNumberRange
            dependentLocality
            doubleDependentLocality
            flatName
            pafOrganisationName
          }
        }
      }
    }`

  const formatResponse = (r) => {
    const { business, customer } = r.data
    const businessInfo = business?.info
    const customerInfo = customer?.info
    const formattedResponse = { business: {}, customer: customerInfo }

    if (businessInfo) {
      formattedResponse.business = {
        name: businessInfo.name,
        reference: businessInfo.reference,
        address: formatAddress(sbi, businessInfo.address),
        landlinePhoneNumber: businessInfo.phone?.landline || undefined,
        mobilePhoneNumber: businessInfo.phone?.mobile || undefined,
        email: businessInfo.email?.address || undefined
      }
    }

    return formattedResponse
  }

  return fetchFromConsolidatedView(request, { query, formatResponse })
}

/**
 * Executes a config-driven GraphQL query and returns the raw response
 * @param {AnyFormRequest} request
 * @param {string} query - GraphQL query string
 * @returns {Promise<object>} Raw API response
 * @throws {ConsolidatedViewApiError} - If the API request fails
 */
export async function executeConfigDrivenQuery(request, query) {
  return fetchFromConsolidatedView(request, {
    query,
    formatResponse: (r) => r
  })
}

export async function fetchBusinessAndCPH(request) {
  const { credentials: { sbi, crn } = {} } = request.auth ?? {}

  const query = `
    query Business {
      customer(crn: "${escapeGraphQLString(crn)}") {
        info {
          name {
            title
            first
            middle
            last
          }
        }
      }
      business(sbi: "${escapeGraphQLString(sbi)}") {
        info {
          reference
          email {
            address
          }
          phone {
            mobile
            landline
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
