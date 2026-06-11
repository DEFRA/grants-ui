import { config } from '~/src/config/config.js'
import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import { escapeGraphQLString } from '~/src/server/common/helpers/graphql-utils.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { ConsolidatedViewError } from '~/src/server/common/utils/errors/ConsolidatedViewError.js'
import { statusCodes } from '../../constants/status-codes.js'

/**
 * @param {GraphQLError[]} errors
 * @param {string[]} [toleratedPaths]
 * @returns {boolean}
 */
export function hasOnlyToleratedFailures(errors, toleratedPaths) {
  const paths = toleratedPaths ?? config.get('consolidatedView.toleratedFailurePaths')
  const allowedPaths = new Set(paths)
  return errors.every((/** @type {GraphQLError} */ error) =>
    error.path?.some((/** @type {string} */ segment) => allowedPaths.has(segment))
  )
}

/**
 * @param {GraphQLResponse | undefined} parsed
 * @param {number} statusCode
 * @param {unknown} sbi
 * @param {string[]} [toleratedPaths]
 * @returns {GraphQLResponse | null}
 */
function extractToleratedPartialSuccess(parsed, statusCode, sbi, toleratedPaths) {
  if (parsed?.data && parsed?.errors?.length && hasOnlyToleratedFailures(parsed.errors, toleratedPaths)) {
    const failedPaths = parsed.errors.map((/** @type {GraphQLError} */ e) => e.path?.join('.')).join(', ')
    log(LogCodes.SYSTEM.CONSOLIDATED_VIEW_PARTIAL_SUCCESS, { sbi, failedPaths, statusCode }, undefined)
    return parsed
  }
  return null
}

/**
 * @typedef {object} LandParcel
 * @property {string} [parcelId] - The parcel identifier
 * @property {string} [sheetId] - The sheet identifier
 */

/**
 * @typedef {object} BusinessResponse
 * @property {object} [data] - The response data object
 * @property {object} [data.business] - Business information
 * @property {object} [data.business.land] - Land information
 * @property {LandParcel[]}  [data.business.land.parcels] - parcels information
 * @property {string} [data.business.sbi] - Standard Business Identifier
 * @property {string} [data.business.organisationId] - Organisation identifier
 * @property {object} [data.business.customer] - Customer details
 * @property {string} [data.business.customer.firstName] - Customer's first name
 * @property {string} [data.business.customer.lastName] - Customer's last name
 * @property {string} [data.business.customer.role] - Customer's role
 */

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
 * @returns {Promise<GraphQLResponse>} API response JSON
 * @throws {ConsolidatedViewError} - If the API request fails
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
 * @throws {ConsolidatedViewError} - If the API request fails
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
    logConsolidatedViewUpstreamError(request, sbi, error)

    if (error instanceof ConsolidatedViewError) {
      throw error
    } else {
      throw new ConsolidatedViewError({
        message: /** @type {Error} */ (error).message,
        status: statusCodes.internalServerError,
        responseBody: /** @type {Error} */ (error).message,
        sbi,
        source: 'fetchFromConsolidatedView',
        reason: 'api_error'
      }).from(/** @type {Error} */ (error))
    }
  }
}

/**
 * @param {AnyFormRequest} request
 * @param {unknown} sbi
 * @param {unknown} error
 */
function logConsolidatedViewUpstreamError(request, sbi, error) {
  const upstream = /** @type {UpstreamError} */ (error)
  log(
    LogCodes.SYSTEM.CONSOLIDATED_VIEW_API_ERROR,
    {
      sbi,
      statusCode: upstream.status ?? upstream.statusCode ?? null,
      errorMessage: upstream.message
    },
    request
  )
}

/**
 * @param {{ query: string, sbi?: unknown, crn?: unknown }} params
 * @returns {Promise<GraphQLResponse>}
 */
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
    throw new ConsolidatedViewError({
      message: 'Stub request failed',
      status: response.status,
      responseBody: await response.text(),
      sbi,
      source: 'makeStubRequest',
      reason: 'api_error'
    })
  }

  const json = await response.json()

  if (json.errors?.length) {
    throw new ConsolidatedViewError({
      message: json.errors[0].message,
      status: statusCodes.badGateway,
      responseBody: json.errors[0].message,
      sbi,
      source: 'makeStubRequest',
      reason: 'api_error'
    })
  }

  return json
}

/**
 * Fetches permission groups for a customer/business relationship from DAL.
 *
 * @param {AnyFormRequest} request
 * @returns {Promise<Array<{
 *   id: string,
 *   level: string,
 *   functions: string[]
 * }>>}
 */
export const fetchBusinessPermissions = async (request) => {
  const { credentials: { sbi, crn } = {} } = request.auth ?? {}
  const query = `
    query GetBusinessPermissions {
      customer(crn: "${escapeGraphQLString(crn)}") {
        business(sbi: "${escapeGraphQLString(sbi)}") {
          permissionGroups {
            id
            level
            functions
          }
        }
      }
    }
  `
  const formatResponse = (/** @type {GraphQLResponse} */ r) => r.data?.customer?.business?.permissionGroups || []
  return fetchFromConsolidatedView(request, { query, formatResponse })
}

/**
 * Fetches business parcels data from Consolidated View
 * @param {AnyFormRequest} request
 * @returns {Promise<any[]>} - Promise that resolves to the parcels array
 * @throws {ConsolidatedViewError} - If the API request fails
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

  const formatResponse = (/** @type {GraphQLResponse} */ r) => r.data?.business?.land?.parcels || []
  return fetchFromConsolidatedView(request, { query, formatResponse })
}

/**
 * @param {unknown} sbi
 * @param {AddressLike} address
 * @returns {{
 *   city: string | null | undefined,
 *   postalCode: string | null | undefined,
 *   line1: string | null | undefined,
 *   line2: string | null | undefined,
 *   line3: string | null | undefined,
 *   line4: string | null | undefined
 * }}
 */
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
 * @throws {ConsolidatedViewError} - If the API request fails
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

  const formatResponse = (/** @type {GraphQLResponse} */ r) => {
    const { business, customer } = r.data ?? {}
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
 * Executes a config-driven GraphQL query and returns the response with address fields formatted.
 * @param {AnyFormRequest} request
 * @param {string} query - GraphQL query string
 * @param {object} [options] - Options
 * @param {string[]} [options.toleratedPaths] - GraphQL paths tolerated as partial failures
 * @returns {Promise<object>} API response with formatted address fields
 * @throws {ConsolidatedViewError} - If the API request fails
 */
export async function executeConfigDrivenQuery(request, query, { toleratedPaths } = {}) {
  const { credentials: { sbi } = {} } = request.auth ?? {}
  return fetchFromConsolidatedView(request, {
    query,
    formatResponse: (/** @type {GraphQLResponse} */ r) => {
      const businessInfo = r.data?.business?.info
      if (!businessInfo?.address) {
        return r
      }

      const formattedBusinessInfo = { ...businessInfo, address: formatAddress(sbi, businessInfo.address) }
      return { ...r, data: { ...r.data, business: { ...r.data?.business, info: formattedBusinessInfo } } }
    },
    toleratedPaths
  })
}

/**
 * Fetches business and county parish holdings from Consolidated View
 * @param {AnyFormRequest} request
 * @param {object} [options] - Options
 * @param {string[]} [options.toleratedPaths] - GraphQL paths tolerated as partial failures
 * @returns {Promise<object>} Business and CPH data
 * @throws {ConsolidatedViewError} - If the API request fails
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

  const formatResponse = (/** @type {GraphQLResponse} */ r) => ({
    business: r.data?.business?.info,
    countyParishHoldings: r.data?.business.countyParishHoldings[0].cphNumber, // just selecting the first cphNumber for demo purposes
    customer: r.data?.customer?.info
  })

  return fetchFromConsolidatedView(request, { query, formatResponse, toleratedPaths })
}

/**
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */

/**
 * @typedef {object} GraphQLError
 * @property {string} [message]
 * @property {string[]} [path]
 */

/**
 * @typedef {{ data?: Record<string, any>, errors?: GraphQLError[] } & Record<string, any>} GraphQLResponse
 */

/**
 * @typedef {{
 *   message?: string,
 *   status?: number,
 *   statusCode?: number
 * } & Record<string, any>} UpstreamError
 */

/**
 * @typedef {{
 *   uprn?: string | number | null,
 *   line1?: string | null,
 *   line2?: string | null,
 *   line3?: string | null,
 *   line4?: string | null,
 *   street?: string | null,
 *   city?: string | null,
 *   postalCode?: string | null,
 *   flatName?: string | null,
 *   buildingName?: string | null,
 *   buildingNumberRange?: string | null,
 *   dependentLocality?: string | null,
 *   doubleDependentLocality?: string | null,
 *   pafOrganisationName?: string | null
 * }} AddressLike
 */
