import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '~/src/config/config.js'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
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
 * Joins address parts, filtering out empty values
 * @param {...string} parts - Address parts to join
 * @returns {string|undefined} - Joined string or undefined if all parts are empty
 */
function joinAddressParts(...parts) {
  return parts.filter(Boolean).join(' ').trim() || undefined
}

/**
 * Configuration for UPRN address line distribution patterns
 * Each pattern defines how to distribute address parts into line1 and line2
 * Patterns are checked in order, first match wins
 */
const UPRN_ADDRESS_PATTERNS = [
  {
    condition: (paf, flat, num, name) => paf && flat && num && name,
    format: (paf, flat, num, name) => ({
      line1: joinAddressParts(paf, flat),
      line2: joinAddressParts(num, name)
    })
  },
  {
    condition: (paf, flat, num) => paf && flat && num,
    format: (paf, flat, num) => ({
      line1: joinAddressParts(paf, flat),
      line2: num
    })
  },
  {
    condition: (paf, flat, num, name) => flat && num && name,
    format: (paf, flat, num, name) => ({
      line1: flat,
      line2: joinAddressParts(num, name)
    })
  },
  {
    condition: (paf, flat, num, name) => paf && flat && name,
    format: (paf, flat, num, name) => ({
      line1: paf,
      line2: joinAddressParts(flat, name)
    })
  },
  {
    condition: (paf, flat, num, name) => paf && num && name,
    format: (paf, flat, num, name) => ({
      line1: paf,
      line2: joinAddressParts(num, name)
    })
  },
  {
    condition: (paf, flat) => paf && flat,
    format: (paf, flat) => ({
      line1: paf,
      line2: flat
    })
  },
  {
    condition: (paf, flat, num, name) => num && name,
    format: (paf, flat, num, name) => ({
      line1: num,
      line2: name
    })
  },
  {
    condition: (paf, flat, num) => paf && num,
    format: (paf, flat, num) => ({
      line1: paf,
      line2: num
    })
  },
  {
    condition: (paf, flat, num, name) => paf && name,
    format: (paf, flat, num, name) => ({
      line1: paf,
      line2: name
    })
  },
  {
    condition: (paf, flat, num) => flat && num,
    format: (paf, flat, num) => ({
      line1: flat,
      line2: num
    })
  },
  {
    condition: (paf, flat, num, name) => flat && name,
    format: (paf, flat, num, name) => ({
      line1: flat,
      line2: name
    })
  },
  {
    condition: (paf) => paf,
    format: (paf) => ({
      line1: paf,
      line2: ' '
    })
  },
  {
    condition: (paf, flat) => flat,
    format: (paf, flat) => ({
      line1: flat,
      line2: ' '
    })
  },
  {
    condition: (paf, flat, num) => num,
    format: (paf, flat, num) => ({
      line1: num,
      line2: ' '
    })
  },
  {
    condition: (paf, flat, num, name) => name,
    format: (paf, flat, num, name) => ({
      line1: name,
      line2: ' '
    })
  }
]

/**
 * Formats UPRN address lines based on available address parts
 * @param {string} pafOrganisationName - PAF organisation name
 * @param {string} flatName - Flat name
 * @param {string} buildingNumberRange - Building number range
 * @param {string} buildingName - Building name
 * @returns {object} - Object with line1 and line2
 */
function formatUprnAddressLines(pafOrganisationName, flatName, buildingNumberRange, buildingName) {
  for (const pattern of UPRN_ADDRESS_PATTERNS) {
    if (pattern.condition(pafOrganisationName, flatName, buildingNumberRange, buildingName)) {
      return pattern.format(pafOrganisationName, flatName, buildingNumberRange, buildingName)
    }
  }

  return {}
}

/**
 * Formats an address object, handling both UPRN and standard addresses
 * @param {object} address - The address object to format
 * @returns {object} - Formatted address
 */
function formatAddress(address) {
  const {
    uprn,
    street,
    city,
    postalCode,
    pafOrganisationName,
    buildingNumberRange,
    dependentLocality,
    doubleDependentLocality,
    flatName,
    buildingName
  } = address

  const commonFields = { street, city, postalCode }

  if (uprn) {
    const { line1, line2 } = formatUprnAddressLines(pafOrganisationName, flatName, buildingNumberRange, buildingName)

    return {
      ...commonFields,
      line1,
      line2,
      line3: dependentLocality,
      line4: doubleDependentLocality
    }
  }

  return {
    ...commonFields,
    line1: address.line1,
    line2: address.line2,
    line3: address.line3,
    line4: address.line4,
    line5: address.line5
  }
}

/**
 * Formats the business and customer response
 * @param {object} response - The API response
 * @returns {object} - Formatted business and customer data
 */
function formatBusinessAndCustomerResponse(response) {
  const { business, customer } = response.data
  const businessInfo = business?.info
  const customerInfo = customer?.info
  const formattedResponse = { business: {}, customer: customerInfo }

  if (businessInfo) {
    formattedResponse.business = {
      name: businessInfo.name,
      reference: businessInfo.reference,
      address: formatAddress(businessInfo.address),
      landlinePhoneNumber: businessInfo.phone?.landline || undefined,
      mobilePhoneNumber: businessInfo.phone?.mobile || undefined,
      email: businessInfo.email?.address || undefined
    }
  }

  return formattedResponse
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

  return fetchFromConsolidatedView(request, { query, formatResponse: formatBusinessAndCustomerResponse })
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
