import { describe, expect, test } from 'vitest'
import { transformClaimAnswers } from './state-to-gas-claim-mapper.js'

describe('transformClaimAnswers', () => {
  test('returns only the claim-specific answer fields', () => {
    const result = transformClaimAnswers({
      referenceNumber: 'WMP-A1B2-C3D4',
      claimNumber: 'WMP-A1B2-C3D4-C0001',
      totalEligibleArea: 24.95,
      unit: 'ha',
      totalClaimAmountPence: 150000,
      // fields that must NOT be forwarded to GAS for a claim
      landParcels: ['SD1234'],
      businessName: 'Acme Farms',
      formSlug: 'woodland'
    })

    expect(result).toEqual({
      referenceNumber: 'WMP-A1B2-C3D4',
      claimNumber: 'WMP-A1B2-C3D4-C0001',
      totalEligibleArea: 24.95,
      unit: 'ha',
      totalClaimAmountPence: 150000
    })
  })

  test('passes through undefined fields without inventing values', () => {
    expect(transformClaimAnswers({})).toEqual({
      referenceNumber: undefined,
      claimNumber: undefined,
      totalEligibleArea: undefined,
      unit: undefined,
      totalClaimAmountPence: undefined
    })
  })
})
