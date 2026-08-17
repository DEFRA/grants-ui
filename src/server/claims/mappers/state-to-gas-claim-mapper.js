/**
 * Transforms the claim submission state into the answers shape expected by GAS
 * for a claim submission.
 *
 * Unlike an application submission, a claim GAS payload must contain ONLY the
 * claim-specific answers below (the standard identifiers/metadata are added by
 * `transformStateObjectToGasApplication`). Nothing else from journey state is
 * sent.
 * @param {Record<string, unknown>} claimSubmissionState
 * @returns {{ totalEligibleArea: unknown, unit: unknown, totalClaimAmountPence: unknown, referenceNumber: unknown, claimNumber: unknown }}
 */
export function transformClaimAnswers(claimSubmissionState) {
  const { totalEligibleArea, unit, totalClaimAmountPence, referenceNumber, claimNumber } = claimSubmissionState
  return { totalEligibleArea, unit, totalClaimAmountPence, referenceNumber, claimNumber }
}
