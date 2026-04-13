import { postToLandGrantsApi } from '~/src/server/land-grants/services/land-grants.client.js'

/**
 * Calls the woodland management plan validate endpoint.
 * @param {object} payload
 * @param {string} baseUrl
 * @returns {Promise<object>}
 */
export async function validateWoodland(payload, baseUrl) {
  return postToLandGrantsApi('/api/v1/wmp/validate', payload, baseUrl)
}
