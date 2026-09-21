import { describe, expect, test } from 'vitest'
import { buildClaimPayload } from './state-to-gas-claim-mapper.js'

describe('buildClaimPayload', () => {
  test('returns the GAS claim contract without application answers', () => {
    const result = buildClaimPayload(
      {
        grantCode: 'woodland',
        clientRef: 'wmp-6hb-jbe',
        clientClaimRef: 'wmp-6hb-jbe-c01',
        sbi: '113593357',
        crn: '1100943757',
        frn: '1100943757',
        configVersion: '1.14.0'
      },
      { entitlementId: 'mongo-entitlement-id', totalClaimAmountPence: 150000 }
    )

    expect(result).toEqual({
      metadata: {
        grantCode: 'woodland',
        clientRef: 'wmp-6hb-jbe',
        clientClaimRef: 'wmp-6hb-jbe-c01',
        sbi: '113593357',
        crn: '1100943757',
        frn: '1100943757',
        configVersion: '1.14.0',
        submittedAt: expect.any(String)
      },
      claim: { entitlementId: 'mongo-entitlement-id', totalClaimAmountPence: 150000 }
    })
  })
})
