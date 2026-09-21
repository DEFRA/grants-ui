/**
 * Builds the GAS claim payload. Claims have a distinct contract from grant
 * applications: their entitlement and amount are under `claim`, not `answers`.
 * @param {{ grantCode: string, clientRef: string, clientClaimRef: string, sbi: string, crn: string, frn: string, configVersion: string }} metadata
 * @param {{ entitlementId: string, totalClaimAmountPence: number }} claim
 * @returns {{ metadata: object, claim: { entitlementId: string, totalClaimAmountPence: number } }}
 */
export function buildClaimPayload(metadata, claim) {
  return {
    metadata: {
      ...metadata,
      submittedAt: new Date().toISOString()
    },
    claim
  }
}
