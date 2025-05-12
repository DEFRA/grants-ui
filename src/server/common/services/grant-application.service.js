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
 * Invokes a POST action on the Grant Application Service (GAS)
 * @param {string} code - Grant code
 * @param {string} name - Action name
 * @param {object} payload - Application payload
 * @returns {Promise} - Promise that resolves to the response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function invokeGasPostAction(code, name, payload) {
  try {
    const response = await fetch(
      `${GAS_API_ENDPOINT}/grants/${code}/actions/${name}/invoke`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new GrantApplicationServiceApiError(
        `${response.status} ${response.statusText}`,
        response.status,
        errorText,
        code
      )
    }

    return response.json()
  } catch (error) {
    logger.error(
      { err: error },
      `Unexpected error submitting grant application: ${error.message}`
    )
    throw new GrantApplicationServiceApiError(
      'Failed to submit grant application: ' + error.message,
      error.status,
      error.message,
      code
    )
  }
}

/**
 * Submits a grant application to the Grant Application Service (GAS)
 * @param {string} code - Grant code
 * @param {object} payload - Application payload
 * @returns {Promise} - Promise that resolves to the submission response
 * @throws {GrantApplicationServiceApiError} - If the API request fails
 */
export async function submitGrantApplication(code, payload) {
  try {
    const response = await fetch(
      `${GAS_API_ENDPOINT}/grants/${code}/applications`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new GrantApplicationServiceApiError(
        `${response.status} ${response.statusText}`,
        response.status,
        errorText,
        code
      )
    }

    return response.json()
  } catch (error) {
    logger.error(
      { err: error },
      `Unexpected error submitting grant application: ${error.message}`
    )
    throw new GrantApplicationServiceApiError(
      'Failed to submit grant application: ' + error.message,
      error.status,
      error.message,
      code
    )
  }
}
