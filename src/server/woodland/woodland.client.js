import { postToLandGrantsApi } from '~/src/server/land-grants/services/land-grants.client.js'

/**
 * Calls the woodland management plan validate endpoint.
 * @param {{ parcelIds: string[], hectaresTenOrOverYearsOld: number, hectaresUnderTenYearsOld: number }} payload
 * @param {string} baseUrl
 * @returns {Promise<object>}
 */
export async function validateWoodland({ parcelIds, hectaresTenOrOverYearsOld, hectaresUnderTenYearsOld }, baseUrl) {
  return postToLandGrantsApi(
    '/api/v1/wmp/validate',
    {
      parcelIds,
      oldWoodlandAreaHa: hectaresTenOrOverYearsOld,
      newWoodlandAreaHa: hectaresUnderTenYearsOld
    },
    baseUrl
  )
}

/**
 * Calls the Land Grants API calculate-wmp endpoint.
 * @param {{ parcelIds: string[], hectaresTenOrOverYearsOld: number, hectaresUnderTenYearsOld: number }} payload
 * @param {string} baseUrl
 * @returns {Promise<{ message: string, payment: object }>}
 * @throws {Error}
 */
export async function calculateWmp({ parcelIds, hectaresTenOrOverYearsOld, hectaresUnderTenYearsOld }, baseUrl) {
  return postToLandGrantsApi(
    '/api/v1/wmp/payments/calculate',
    {
      parcelIds,
      oldWoodlandAreaHa: hectaresTenOrOverYearsOld,
      newWoodlandAreaHa: hectaresUnderTenYearsOld
    },
    baseUrl
  )
}
