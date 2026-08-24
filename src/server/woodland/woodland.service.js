import { config } from '~/src/config/config.js'
import { validateWoodland, calculateWmp, calculateWmpByTotalArea } from '~/src/server/woodland/woodland.client.js'
import { ExternalApiError } from '~/src/server/common/utils/errors/ExternalApiError.js'

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
 * @param {number} options.hectaresTenOrOverYearsOld
 * @param {number} options.hectaresUnderTenYearsOld
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<string[]>}
 */
export async function validateWoodlandHectares(
  { parcelIds, hectaresTenOrOverYearsOld, hectaresUnderTenYearsOld },
  userContext
) {
  const response = /** @type {WoodlandValidationResponse} */ (
    await validateWoodland(
      { parcelIds, hectaresTenOrOverYearsOld, hectaresUnderTenYearsOld },
      LAND_GRANTS_API_URL,
      userContext
    )
  )

  if (response.result?.hasPassed) {
    return []
  }

  return (response.result?.rules ?? []).filter((rule) => !rule.passed).map((rule) => rule.reason)
}

/**
 * Calculates a one-off WMP payment.
 * @param {{ parcelIds: string[], hectaresUnderTenYearsOld: number, hectaresTenOrOverYearsOld: number }} params
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{ payment: PaymentCalculation, totalPence: number }>}
 * @throws {Error}
 */
export async function calculateWmpPayment(
  { parcelIds, hectaresUnderTenYearsOld, hectaresTenOrOverYearsOld },
  userContext
) {
  const { payment } = await calculateWmp(
    { parcelIds, hectaresUnderTenYearsOld, hectaresTenOrOverYearsOld },
    LAND_GRANTS_API_URL,
    userContext
  )
  const totalPence = payment?.agreementTotalPence ?? 0
  return { payment, totalPence }
}

/**
 * Calculates a one-off WMP payment from a total eligible area.
 * @param {{ totalAreaHa: number, applicationId: string, sbi: string, crn?: string }} params
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{ payment: PaymentCalculation, totalPence: number }>}
 * @throws {Error}
 */
export async function calculateWmpPaymentByTotalArea({ totalAreaHa, applicationId, sbi, crn }, userContext) {
  const { payment } = await calculateWmpByTotalArea(
    { totalAreaHa, applicationId, sbi, crn },
    LAND_GRANTS_API_URL,
    userContext
  )
  const totalPence = payment?.agreementTotalPence

  if (totalPence == null) {
    throw new ExternalApiError({
      message: 'Land Grants API returned no agreementTotalPence for the claim payment',
      source: 'calculateWmpPaymentByTotalArea',
      reason: 'invalid_response'
    })
  }

  return { payment, totalPence }
}

/**
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { LandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
 */
