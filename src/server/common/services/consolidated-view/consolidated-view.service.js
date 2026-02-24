import { config } from '~/src/config/config.js'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import { escapeGraphQLString } from '~/src/server/common/helpers/graphql-utils.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { log, debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { ConsolidatedViewError } from '~/src/server/common/utils/errors/ConsolidatedViewError.js'
import { statusCodes } from '../../constants/status-codes.js'

export function hasOnlyToleratedFailures(errors, toleratedPaths) {
  const paths = toleratedPaths ?? config.get('consolidatedView.toleratedFailurePaths')
  const allowedPaths = new Set(paths)
  return errors.every((error) => error.path?.some((segment) => allowedPaths.has(segment)))
}

function extractToleratedPartialSuccess(parsed, statusCode, sbi, toleratedPaths) {
  if (parsed?.data && parsed?.errors?.length && hasOnlyToleratedFailures(parsed.errors, toleratedPaths)) {
    const failedPaths = parsed.errors.map((e) => e.path?.join('.')).join(', ')
    log(LogCodes.SYSTEM.CONSOLIDATED_VIEW_PARTIAL_SUCCESS, { sbi, failedPaths, statusCode }, undefined)
    return parsed
  }
  return null
}

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

  const developerKey = config.get('consolidatedView.developerKey')

  const isLocal = config.get('cdpEnvironment') === 'local'

  const headers = {
    'Content-Type': 'application/json',
    ...(isLocal && { 'Accept-Encoding': 'identity' }),
    'gateway-type': 'external',
    'x-forwarded-authorization': token,
    Authorization: `Bearer ${await getValidToken()}`,
    ...(isLocal && developerKey && { 'x-api-key': developerKey })
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
 * Makes a request to the Consolidated View API
 * @param {AnyFormRequest} request
 * @param {string} query - GraphQL query
 * @param {object} [options] - Options
 * @param {string[]} [options.toleratedPaths] - GraphQL paths tolerated as partial failures
 * @returns {Promise<object>} API response JSON
 * @throws {ConsolidatedViewApiError} - If the API request fails
 */
async function makeConsolidatedViewRequest(request, query, { toleratedPaths } = {}) {
  const sbi = request.auth.credentials.sbi
  const CV_API_ENDPOINT = config.get('consolidatedView.apiEndpoint')

  const fetchOperation = async () => {
    const response = await fetch(CV_API_ENDPOINT, await getConsolidatedViewRequestOptions(request, { query }))

    if (!response.ok) {
      const responseText = await response.text()

      let parsed
      try {
        parsed = JSON.parse(responseText)
      } catch {
        // not JSON — fall through to throw
      }

      const partialSuccess = extractToleratedPartialSuccess(parsed, response.status, sbi, toleratedPaths)
      if (partialSuccess) {
        return partialSuccess
      }

      throw new ConsolidatedViewError({
        message: `Failed to fetch business data: ${response.status} ${response.statusText}`,
        status: response.status,
        responseBody: responseText,
        sbi,
        source: 'makeConsolidatedViewRequest',
        reason: 'api_response_not_ok'
      })
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
 * @param {string[]} [params.toleratedPaths] - GraphQL paths tolerated as partial failures
 * @returns {Promise<any>} Formatted response data
 * @throws {ConsolidatedViewApiError} - If the API request fails
 */
async function fetchFromConsolidatedView(request, { query, formatResponse, toleratedPaths }) {
  const mockDALEnabled = config.get('consolidatedView.mockDALEnabled')
  const { credentials: { sbi, crn } = {} } = request.auth ?? {}

  try {
    const responseJson = mockDALEnabled
      ? await makeStubRequest({ query, sbi, crn })
      : await makeConsolidatedViewRequest(request, query, { toleratedPaths })

    if (!responseJson.errors?.length) {
      log(LogCodes.SYSTEM.CONSOLIDATED_VIEW_SUCCESS, { sbi }, request)
    }

    return formatResponse(responseJson)
  } catch (error) {
    debug(
      LogCodes.SYSTEM.CONSOLIDATED_VIEW_API_ERROR,
      {
        sbi,
        errorMessage: error.message
      },
      request
    )
    throw new ConsolidatedViewError({
      message: error.message,
      status: error.status,
      responseBody: error.message,
      sbi,
      source: 'fetchFromConsolidatedView',
      reason: 'api_error'
    }).from(error)
  }
}

async function makeStubRequest({ query, sbi, crn }) {
  const stubUrl = config.get('consolidatedView.stubUrl')

  const response = await fetch(stubUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      variables: {
        sbi,
        crn
      }
    })
  })

  if (!response.ok) {
    throw new ConsolidatedViewApiError('Stub request failed', response.status, await response.text(), sbi)
  }

  const json = await response.json()

  if (json.errors?.length) {
    throw new ConsolidatedViewApiError(json.errors[0].message, statusCodes.badGateway, json.errors[0].message, sbi)
  }

  return json
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
 * @param {object} [options] - Options
 * @param {string[]} [options.toleratedPaths] - GraphQL paths tolerated as partial failures
 * @returns {Promise<object>} Raw API response
 * @throws {ConsolidatedViewApiError} - If the API request fails
 */
export async function executeConfigDrivenQuery(request, query, { toleratedPaths } = {}) {
  return fetchFromConsolidatedView(request, {
    query,
    formatResponse: (r) => r,
    toleratedPaths
  })
}

/**
 * Fetches business and county parish holdings from Consolidated View
 * @param {AnyFormRequest} request
 * @param {object} [options] - Options
 * @param {string[]} [options.toleratedPaths] - GraphQL paths tolerated as partial failures
 * @returns {Promise<object>} Business and CPH data
 * @throws {ConsolidatedViewApiError} - If the API request fails
 */
export async function fetchBusinessAndCPH(request, { toleratedPaths } = {}) {
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

  return fetchFromConsolidatedView(request, { query, formatResponse, toleratedPaths })
}

/**
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
