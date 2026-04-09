import { config } from '~/src/config/config.js'
import { validateWoodland } from '~/src/server/woodland/woodland.client.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')

/**
 * @typedef {object} WoodlandValidationRule
 * @property {string} name
 * @property {boolean} passed
 * @property {string} reason
 */

/**
 * @typedef {object} WoodlandValidationResult
 * @property {boolean} hasPassed
 * @property {WoodlandValidationRule[]} rules
 */

/**
 * @typedef {object} WoodlandValidationResponse
 * @property {string} message
 * @property {WoodlandValidationResult} result
 */

/**
 * Validates woodland hectare inputs against the backend.
 * Returns an array of error strings from any failed rules, or an empty array on success.
 * @param {object} options
 * @param {string[]} options.parcelIds
 * @param {number} options.oldWoodlandAreaHa
 * @param {number} options.newWoodlandAreaHa
 * @returns {Promise<string[]>}
 */
export async function validateWoodlandHectares({ parcelIds, oldWoodlandAreaHa, newWoodlandAreaHa }) {
  const response = /** @type {WoodlandValidationResponse} */ (
    await validateWoodland({ parcelIds, oldWoodlandAreaHa, newWoodlandAreaHa }, LAND_GRANTS_API_URL)
  )

  if (response.result?.hasPassed) {
    return []
  }

  return (response.result?.rules ?? [])
    .filter((rule) => !rule.passed)
    .map((rule) => rule.reason)
}
