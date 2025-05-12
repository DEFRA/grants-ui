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
 * @param {object} payload - Request payload
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
async function makeGasApiRequest(url, grantCode, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
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
  return makeGasApiRequest(url, code, payload)
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
  return makeGasApiRequest(url, code, payload)
}
