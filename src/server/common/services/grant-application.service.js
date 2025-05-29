import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

const DEFAULT_STATUS_CODE = 500
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

function getGrantUrl(grantCode) {
  return `${GAS_API_ENDPOINT}/grants/${grantCode}`
}

function getActionUrl(grantCode, actionName) {
  return `${GAS_API_ENDPOINT}/grants/${grantCode}/actions/${actionName}/invoke`
}

/**
 * Makes a request to the Grant Application Service (GAS) API
 * @param {object} params - Request parameters
 * @param {string} params.url - API endpoint URL
 * @param {string} params.method - Request method (GET, POST, etc.)
 * @param {string} params.grantCode - Grant code for error context
 * @param {object} [params.payload] - Request payload
 * @param {string} [params.queryString] - Query string for GET requests
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
async function makeGasApiRequest({
  url,
  method,
  grantCode,
  payload = null,
  queryString = null
}) {
  try {
    const body = method === 'POST' && payload ? JSON.stringify(payload) : null
    const requestUrl = queryString ? `${url}?${queryString}` : url

    const response = await fetch(requestUrl, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new GrantApplicationServiceApiError(
        `${response.status} ${response.statusText}`,
        response.status,
        errorText,
        grantCode
      )
    }

    return response.json()
  } catch (error) {
    logger.error(
      { err: error },
      `Unexpected error in GAS API request: ${error.message}`
    )

    if (error instanceof GrantApplicationServiceApiError) {
      throw error
    }

    throw new GrantApplicationServiceApiError(
      'Failed to process GAS API request: ' + error.message,
      error.status || DEFAULT_STATUS_CODE,
      error.responseBody || error.message,
      grantCode
    )
  }
}

/**
 * Invokes a GET action on the Grant Application Service (GAS)
 * @param {object} params - Request parameters
 * @param {string} params.grantCode - Grant code
 * @param {string} params.actionName - Action name
 * @param {string} [params.queryString] - The query string
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function invokeGasGetAction({
  grantCode,
  actionName,
  queryString
}) {
  return makeGasApiRequest({
    url: getActionUrl(grantCode, actionName),
    method: 'GET',
    grantCode,
    queryString
  })
}

/**
 * Invokes a POST action on the Grant Application Service (GAS)
 * @param {object} params - Request parameters
 * @param {string} params.grantCode - Grant code
 * @param {string} params.actionName - Action name
 * @param {object} params.payload - Application payload
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function invokeGasPostAction({ grantCode, actionName, payload }) {
  return makeGasApiRequest({
    url: getActionUrl(grantCode, actionName),
    method: 'POST',
    grantCode,
    payload
  })
}

/**
 * Submits a grant application to the Grant Application Service (GAS)
 * @param {object} params - Request parameters
 * @param {string} params.grantCode - Grant code
 * @param {object} params.payload - Application payload
 * @returns {Promise} - Promise that resolves to the submission response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function submitGrantApplication({ grantCode, payload }) {
  return makeGasApiRequest({
    url: `${getGrantUrl(grantCode)}/applications`,
    method: 'POST',
    grantCode,
    payload
  })
}
