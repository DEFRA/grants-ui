/**
 * @typedef {object} WmpAgreementLevelItem
 * @property {string} code
 * @property {string} description
 * @property {number} activePaymentTier
 * @property {number} quantityInActiveTier
 * @property {number} activeTierRatePence
 * @property {number} activeTierFlatRatePence
 * @property {number} quantity
 * @property {number} agreementTotalPence
 * @property {string} unit
 */

/**
 * @typedef {object} WmpPayment
 * @property {number} agreementTotalPence
 * @property {Record<string, WmpAgreementLevelItem>} agreementLevelItems
 */

/**
 * Maps the raw WMP payment API response into the GAS payment shape.
 * Agreement-level only — WMP has no parcel-level payment breakdown.
 * @param {WmpPayment | undefined} payment - Raw payment object from state
 * @returns {object}
 */
function mapWoodlandPayment(payment) {
  const agreement = Object.values(payment?.agreementLevelItems ?? {}).map((item) => ({
    code: item.code,
    description: item.description,
    activePaymentTier: item.activePaymentTier,
    quantityInActiveTier: item.quantityInActiveTier,
    activeTierRatePence: item.activeTierRatePence,
    activeTierFlatRatePence: item.activeTierFlatRatePence,
    quantity: item.quantity,
    agreementTotalPence: item.agreementTotalPence,
    unit: item.unit
  }))

  return {
    totalAgreementPaymentPence: payment?.agreementTotalPence ?? 0,
    payments: { agreement }
  }
}

/**
 * Transforms the raw submission state into the answers shape expected by GAS
 * for the woodland (WMP) journey.
 *
 * Changes from the default passthrough:
 * - Removes `referenceNumber` (not required by GAS for woodland)
 * - Replaces `landParcels` (string IDs) with `landParcelMetadata` under the `landParcels` key,
 *   which is already stored as `[{ parcelId, areaHa }]` by CommonSelectLandParcelPageController
 * - Maps `payment` from raw API response (in rawState) to GAS shape
 * @param {Record<string, unknown>} submissionState
 * @param {Record<string, unknown>} rawState
 * @returns {object}
 */
export const transformWoodlandAnswers = (submissionState, rawState) => {
  const { ...rest } = submissionState
  delete rest.referenceNumber
  delete rest.landParcels

  return {
    ...rest,
    landParcels: /** @type {unknown[]} */ (rawState.landParcelMetadata) ?? [],
    ...mapWoodlandPayment(/** @type {WmpPayment} */ (rawState.payment))
  }
}
