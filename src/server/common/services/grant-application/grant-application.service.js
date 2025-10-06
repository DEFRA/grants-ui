import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

const GAS_API_ENDPOINT = config.get('gas.apiEndpoint')
const logger = createLogger()

class GrantApplicationServiceApiError extends Error {
  constructor(message, statusCode, responseBody, code) {
    super(message)
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
 * @param {object} options - Request options
 * @param {string} [options.method] - HTTP method (GET, POST, etc.)
 * @param {object} [options.payload] - Request payload for POST requests
 * @param {object} [options.queryParams] - Query parameters for GET requests
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function makeGasApiRequest(url, grantCode, options = {}) {
  const { method = 'POST', payload, queryParams } = options

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
        'Content-Type': 'application/json'
      }
    }

    if (method !== 'GET' && payload) {
      requestOptions.body = JSON.stringify(payload)
    }

    const response = await fetch(requestUrl, requestOptions)

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
    logger.error({ err: error }, `Unexpected error in GAS API request: ${error.message}`)
    throw new GrantApplicationServiceApiError(
      'Failed to process GAS API request: ' + error.message,
      error.status,
      error.message,
      grantCode
    )
  }
}

/**
 * Invokes a POST action on the Grant Application Service (GAS)
 * @param {string} code - Grant code
 * @param {string} name - Action name
 * @param {object} payload - Application payload
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function invokeGasPostAction(code, name, payload) {
  const url = `${GAS_API_ENDPOINT}/grants/${code}/actions/${name}/invoke`
  const response = await makeGasApiRequest(url, code, {
    method: 'POST',
    payload
  })
  return response.json()
}

/**
 * Invokes a GET action on the Grant Application Service (GAS)
 * @param {string} code - Grant code
 * @param {string} name - Action name
 * @param {object} [queryParams] - Optional query parameters
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function invokeGasGetAction(code, name, queryParams = {}) {
  const url = `${GAS_API_ENDPOINT}/grants/${code}/actions/${name}/invoke`
  const response = await makeGasApiRequest(url, code, {
    method: 'GET',
    queryParams
  })
  return response.json()
}

/**
 * Submits a grant application to the Grant Application Service (GAS)
 * @param {string} code - Grant code
 * @param {object} payload - Application payload
 * @returns {Promise} - Promise that resolves to the submission response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function submitGrantApplication(code, payload) {
  const url = `${GAS_API_ENDPOINT}/grants/${code}/applications`
  return makeGasApiRequest(url, code, { method: 'POST', payload })
}
