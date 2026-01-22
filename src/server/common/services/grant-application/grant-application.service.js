import { config } from '~/src/config/config.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { retry } from '~/src/server/common/helpers/retry.js'

const GAS_API_ENDPOINT = config.get('gas.apiEndpoint')
const GAS_API_AUTH_TOKEN = config.get('gas.authToken')

class GrantApplicationServiceApiError extends Error {
  constructor(message, statusCode, responseBody, code, cause = null) {
    super(message, cause ? { cause } : undefined)
    this.name = 'GrantApplicationServiceApiError'
    this.status = statusCode
    this.responseBody = responseBody
    this.grantCode = code
  }
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
    // Add query parameters for GET requests
    let requestUrl = url
    if (method === 'GET' && queryParams) {
      const searchParams = new URLSearchParams()
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, value.toString())
        }
      })
      if (searchParams.toString()) {
        requestUrl += `?${searchParams.toString()}`
      }
    }

    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(GAS_API_AUTH_TOKEN ? { Authorization: `Bearer ${GAS_API_AUTH_TOKEN}` } : {})
      }
    }

    if (method !== 'GET' && payload) {
      requestOptions.body = JSON.stringify(payload)
    }

    const response = await retry(() => fetch(requestUrl, requestOptions), {
      timeout: 30000,
      ...retryConfig,
      checkFetchResponse: true,
      serviceName: 'GrantApplicationService.makeGasApiRequest'
    })

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
  } catch (error) {
    log(
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
  const url = `${GAS_API_ENDPOINT}/grants/${code}/applications`
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
  const url = `${GAS_API_ENDPOINT}/grants/${code}/applications/${clientRef}/status`
  return makeGasApiRequest(url, code, request, { method: 'GET' })
}
