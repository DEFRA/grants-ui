import { postToLandGrantsApi } from '~/src/server/land-grants/services/land-grants.client.js'

/**
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 */

/**
 * Calls the woodland management plan validate endpoint.
 * @param {{ parcelIds: string[], hectaresTenOrOverYearsOld: number, hectaresUnderTenYearsOld: number }} payload
 * @param {string} baseUrl
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<object>}
 */
export async function validateWoodland(
  { parcelIds, hectaresTenOrOverYearsOld, hectaresUnderTenYearsOld },
  baseUrl,
  userContext
) {
  return postToLandGrantsApi(
    '/api/v1/wmp/validate',
    {
      parcelIds,
      oldWoodlandAreaHa: hectaresTenOrOverYearsOld,
      newWoodlandAreaHa: hectaresUnderTenYearsOld
    },
    baseUrl,
    userContext
  )
}

/**
 * Calls the Land Grants API calculate-wmp endpoint.
 * @param {{ parcelIds: string[], hectaresTenOrOverYearsOld: number, hectaresUnderTenYearsOld: number }} payload
 * @param {string} baseUrl
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{ message: string, payment: PaymentCalculation }>}
 * @throws {Error}
 */
export async function calculateWmp(
  { parcelIds, hectaresTenOrOverYearsOld, hectaresUnderTenYearsOld },
  baseUrl,
  userContext
) {
  return postToLandGrantsApi(
    '/api/v1/wmp/payments/calculate',
    {
      parcelIds,
      oldWoodlandAreaHa: hectaresTenOrOverYearsOld,
      newWoodlandAreaHa: hectaresUnderTenYearsOld
    },
    baseUrl,
    userContext
  )
}

/**
 * Calls the Land Grants API calculate-by-total-area endpoint.
 * @param {{ totalAreaHa: number, applicationId: string, sbi: string, crn?: string }} payload
 * @param {string} baseUrl
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{ message: string, payment: PaymentCalculation }>}
 * @throws {Error}
 */
export async function calculateWmpByTotalArea({ totalAreaHa, applicationId, sbi, crn }, baseUrl, userContext) {
  return postToLandGrantsApi(
    '/api/v1/wmp/payments/calculate-by-total-area',
    {
      totalAreaHa,
      applicationId,
      sbi,
      crn
    },
    baseUrl,
    userContext
  )
}

/**
 * @import { LandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
 */
