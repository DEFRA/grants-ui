import { config } from '~/src/config/config.js'
import { debug } from '~/src/server/common/helpers/logging/log.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { statusCodes } from '../../constants/status-codes.js'

const GAS_API_ENDPOINT = config.get('gas.apiEndpoint')
const GAS_API_AUTH_TOKEN = config.get('gas.authToken')

/**
 * Custom error type thrown when GAS API requests fail.
 */
class GrantApplicationServiceApiError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code returned by GAS
   * @param {string} responseBody - Error response body from GAS
   * @param {string} code - Grant code for context
   * @param {Error} [cause] - Optional underlying error
   */
  constructor(message, statusCode, responseBody, code, cause = null) {
    super(message, cause ? { cause } : undefined)
    this.name = 'GrantApplicationServiceApiError'
    this.status = statusCode
    this.responseBody = responseBody
    this.grantCode = code
  }
}

/**
 * Builds HTTP request options for GAS API calls.
 *
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {object} [payload] - Request payload for non-GET requests
 * @returns {RequestInit} Fetch-compatible request options
 * @private
 */
function buildRequestOptions(method, payload) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(GAS_API_AUTH_TOKEN ? { Authorization: `Bearer ${GAS_API_AUTH_TOKEN}` } : {})
    }
  }

  if (method !== 'GET' && payload) {
    options.body = JSON.stringify(payload)
  }

  return options
}

/**
 * Builds a full request URL including query parameters (if provided).
 *
 * @param {string} url - Base API URL
 * @param {string} method - HTTP method
 * @param {object} [queryParams] - Optional query parameters
 * @returns {string} Fully constructed URL
 * @private
 */
function buildRequestUrl(url, method, queryParams) {
  if (method !== 'GET' || !queryParams) {
    return url
  }

  const searchParams = new URLSearchParams()

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value.toString())
    }
  })

  const query = searchParams.toString()
  return query ? `${url}?${query}` : url
}

/**
 * Validates the HTTP response and throws a typed error if the request failed.
 *
 * @param {Response} response - Fetch response object
 * @param {string} grantCode - Grant code for error context
 * @returns {Promise<Response>} The original response if successful
 * @throws {GrantApplicationServiceApiError}
 * @private
 */
async function handleResponse(response, grantCode) {
  if (!response.ok) {
    const error = await response.json()

    throw new GrantApplicationServiceApiError(
      `${response.status} ${response.statusText} - ${error.message}`,
      response.status,
      error.message,
      grantCode
    )
  }

  return response
}

/**
 * Makes a request to the Grant Application Service (GAS) API
 * @param {string} url - API endpoint URL
 * @param {string} grantCode - Grant code for error context
 * @param {object} request - Request object
 * @param {object} options - Request options
 * @param {string} [options.method] - HTTP method (GET, POST, etc.)
 * @param {object} [options.payload] - Request payload for POST requests
 * @param {object} [options.queryParams] - Query parameters for GET requests
 * @param {object} [options.retryConfig] - Configuration for the retry mechanism
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function makeGasApiRequest(url, grantCode, request, options = {}) {
  const { method = 'POST', payload, queryParams, retryConfig = {} } = options

  try {
    const requestUrl = buildRequestUrl(url, method, queryParams)
    const requestOptions = buildRequestOptions(method, payload)

    const response = await retry(() => fetch(requestUrl, requestOptions), {
      timeout: 30000,
      ...retryConfig,
      checkFetchResponse: true,
      serviceName: 'GrantApplicationService.makeGasApiRequest'
    })

    await handleResponse(response, grantCode)

    if (response.status === statusCodes.noContent && response.body) {
      await response.arrayBuffer()
    }

    return response
  } catch (error) {
    debug(
      {
        level: 'error',
        error,
        messageFunc: () => 'Unexpected error in GAS API request: ' + error.message
      },
      {},
      request
    )
    if (error instanceof GrantApplicationServiceApiError) {
      throw error
    }

    throw new GrantApplicationServiceApiError(
      'Failed to process GAS API request: ' + error.message,
      error.status,
      error.message,
      grantCode,
      error
    )
  }
}

/**
 * Invokes a POST action on the Grant Application Service (GAS)
 * @param {string} code - Grant code
 * @param {string} name - Action name
 * @param {object} payload - Application payload
 * @param {object} request - Request
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function invokeGasPostAction(code, name, payload, request) {
  const url = `${GAS_API_ENDPOINT}/grants/${code}/actions/${name}/invoke`
  const response = await makeGasApiRequest(url, code, request, {
    method: 'POST',
    payload
  })
  return response.json()
}

/**
 * Invokes a GET action on the Grant Application Service (GAS)
 * @param {string} code - Grant code
 * @param {string} name - Action name
 * @param {object} request - Request
 * @param {object} [queryParams] - Optional query parameters
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function invokeGasGetAction(code, name, request, queryParams = {}) {
  const url = `${GAS_API_ENDPOINT}/grants/${code}/actions/${name}/invoke`
  const response = await makeGasApiRequest(url, code, request, {
    method: 'GET',
    queryParams
  })
  return response.json()
}

/**
 * Submits a grant application to the Grant Application Service (GAS)
 * @param {string} code - Grant code
 * @param {object} payload - Application payload
 * @param {object} request - Request object
 * @returns {Promise} - Promise that resolves to the submission response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function submitGrantApplication(code, payload, request) {
  const url = `${GAS_API_ENDPOINT}/grants/${mapFarmPaymentsGrantCode(code)}/applications`
  return makeGasApiRequest(url, code, request, { method: 'POST', payload })
}

/**
 * Fetches the status of a specific application from GAS
 * @param {string} code - Grant code
 * @param {string} clientRef - Application client reference
 * @param {object} request - Request object
 * @returns {Promise<object|null>} - Status JSON from GAS, or null if not found
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function getApplicationStatus(code, clientRef, request) {
  const url = `${GAS_API_ENDPOINT}/grants/${mapFarmPaymentsGrantCode(code)}/applications/${clientRef}/status`
  return makeGasApiRequest(url, code, request, { method: 'GET' })
}

/**
 * Temporary function to map `farm-payments` grant code to `frps-private-beta` for GAS API calls
 * @param grantCode
 * @returns {*|string}
 */
function mapFarmPaymentsGrantCode(grantCode) {
  if (grantCode === 'farm-payments') {
    return `frps-private-beta`
  }
  return grantCode
}
