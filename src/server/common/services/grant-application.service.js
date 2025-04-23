import { config } from '~/src/config/config.js'

const GAS_API_URL = config.get('gas.apiEndpoint')

/**
 * Submits a grant application to Grants Application service
 * @param {string} code - Grant code
 * @param {object} payload - Application payload
 * @returns {Promise<object>} - Promise that resolves to the validation result
 * @throws {Error} - If the request fails
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
    throw error
  }

  return response.json()
}
