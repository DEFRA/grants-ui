import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

const GAS_API_URL = config.get('gas.apiEndpoint')
const logger = createLogger()

class GrantApplicationServiceApiError extends Error {
  constructor(message, statusCode, responseBody, grantCode) {
    super(message)
    this.name = 'GrantApplicationServiceApiError'
    this.code = statusCode
    this.responseBody = responseBody
    this.grantCode = grantCode
  }
}

/**
 * Submits a grant application to Grants Application service
 * @param {string} code - Grant code
 * @param {object} payload - Application payload
 * @returns {Promise<object>} - Promise that resolves to the validation result
 * @throws {ConsolidatedViewApiError} - If the API request fails
 * @throws {Error} - For other unexpected errors
 */
export async function submitGrantApplication(code, payload) {
  const response = await fetch(`${GAS_API_URL}/grants/${code}/applications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    /**
     * @type {Error & {code?: number}}
     */

    const data = await response.json()
    const error = new Error(data.message)
    error.code = response.status

    logger.error(
      {
        statusCode: response.status,
        responseText: data.message,
        grantCode: code
      },
      'Failed to submit grant application'
    )

    throw new GrantApplicationServiceApiError(
      `Failed to submit grant application: ${error.code} ${response.statusText}`,
      response.status,
      data.message,
      code
    )
  }

  return response.json()
}
