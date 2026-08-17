import { describe, expect, test } from 'vitest'
import {
  ClaimStatus,
  generateClaimNumber,
  getClaims,
  getCurrentClaim,
  getLatestClaim,
  markClaimSubmitted,
  upsertCurrentClaim
} from './claim-state.js'

describe('claim-state', () => {
  describe('generateClaimNumber', () => {
    test('derives a claim number from the application reference and sequence', () => {
      expect(generateClaimNumber('WMP-A1B2-C3D4', 1)).toBe('WMP-A1B2-C3D4-C0001')
      expect(generateClaimNumber('WMP-A1B2-C3D4', 3)).toBe('WMP-A1B2-C3D4-C0003')
    })
  })

  describe('getClaims', () => {
    test('returns the claims array when present', () => {
      const claims = [{ claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.IN_PROGRESS }]
      expect(getClaims({ claims })).toBe(claims)
    })

    test.each([undefined, {}, { claims: null }, { claims: 'nope' }])(
      'returns an empty array when claims is missing/invalid (%o)',
      (state) => {
        expect(getClaims(state)).toEqual([])
      }
    )
  })

  describe('getCurrentClaim', () => {
    test('returns the first not-yet-submitted claim', () => {
      const state = {
        claims: [
          { claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.SUBMITTED },
          { claimNumber: 'WMP-A1B2-C3D4-C0002', status: ClaimStatus.IN_PROGRESS }
        ]
      }
      expect(getCurrentClaim(state)?.claimNumber).toBe('WMP-A1B2-C3D4-C0002')
    })

    test('returns undefined when every claim is submitted', () => {
      const state = { claims: [{ claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.SUBMITTED }] }
      expect(getCurrentClaim(state)).toBeUndefined()
    })

    test('returns undefined when there are no claims', () => {
      expect(getCurrentClaim({})).toBeUndefined()
    })
  })

  describe('getLatestClaim', () => {
    test('returns the most recent claim regardless of status', () => {
      const state = {
        claims: [
          { claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.SUBMITTED },
          { claimNumber: 'WMP-A1B2-C3D4-C0002', status: ClaimStatus.SUBMITTED }
        ]
      }
      expect(getLatestClaim(state)?.claimNumber).toBe('WMP-A1B2-C3D4-C0002')
    })

    test('returns the single claim when only one exists', () => {
      const state = { claims: [{ claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.IN_PROGRESS }] }
      expect(getLatestClaim(state)?.claimNumber).toBe('WMP-A1B2-C3D4-C0001')
    })

    test('returns undefined when there are no claims', () => {
      expect(getLatestClaim({})).toBeUndefined()
    })
  })

  describe('upsertCurrentClaim', () => {
    test('creates a new claim with a derived claim number when none exists', () => {
      const { claims, currentClaim } = upsertCurrentClaim(
        {},
        { referenceNumber: 'WMP-A1B2-C3D4', totalEligibleArea: 24.95, unit: 'ha', totalClaimAmountPence: 150000 }
      )

      expect(currentClaim).toEqual({
        claimNumber: 'WMP-A1B2-C3D4-C0001',
        status: ClaimStatus.IN_PROGRESS,
        totalEligibleArea: 24.95,
        unit: 'ha',
        totalClaimAmountPence: 150000
      })
      expect(claims).toEqual([currentClaim])
    })

    test('numbers a new claim after existing submitted claims', () => {
      const state = { claims: [{ claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.SUBMITTED }] }

      const { claims, currentClaim } = upsertCurrentClaim(state, {
        referenceNumber: 'WMP-A1B2-C3D4',
        totalEligibleArea: 10,
        unit: 'ha',
        totalClaimAmountPence: 10000
      })

      expect(currentClaim.claimNumber).toBe('WMP-A1B2-C3D4-C0002')
      expect(claims).toHaveLength(2)
    })

    test('refreshes amounts on the existing current claim instead of creating a new one', () => {
      const state = {
        claims: [
          {
            claimNumber: 'WMP-A1B2-C3D4-C0001',
            status: ClaimStatus.IN_PROGRESS,
            totalEligibleArea: 1.11,
            unit: 'old',
            totalClaimAmountPence: 0
          }
        ]
      }

      const { claims, currentClaim } = upsertCurrentClaim(state, {
        referenceNumber: 'WMP-A1B2-C3D4',
        totalEligibleArea: 24.95,
        unit: 'ha',
        totalClaimAmountPence: 150000
      })

      expect(claims).toHaveLength(1)
      expect(currentClaim).toEqual({
        claimNumber: 'WMP-A1B2-C3D4-C0001',
        status: ClaimStatus.IN_PROGRESS,
        totalEligibleArea: 24.95,
        unit: 'ha',
        totalClaimAmountPence: 150000
      })
    })

    test('does not mutate the original state claims', () => {
      const original = [{ claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.IN_PROGRESS }]
      const state = { claims: original }

      upsertCurrentClaim(state, {
        referenceNumber: 'WMP-A1B2-C3D4',
        totalEligibleArea: 1,
        unit: 'ha',
        totalClaimAmountPence: 1
      })

      expect(original[0]).toEqual({ claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.IN_PROGRESS })
    })
  })

  describe('markClaimSubmitted', () => {
    test('flips only the matching claim to SUBMITTED with a submittedAt', () => {
      const state = {
        claims: [
          { claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.SUBMITTED },
          { claimNumber: 'WMP-A1B2-C3D4-C0002', status: ClaimStatus.IN_PROGRESS }
        ]
      }

      const result = markClaimSubmitted(state, 'WMP-A1B2-C3D4-C0002', '2025-01-01T00:00:00.000Z')

      expect(result).toEqual([
        { claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.SUBMITTED },
        { claimNumber: 'WMP-A1B2-C3D4-C0002', status: ClaimStatus.SUBMITTED, submittedAt: '2025-01-01T00:00:00.000Z' }
      ])
    })

    test('does not mutate the original state claims', () => {
      const original = [{ claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.IN_PROGRESS }]

      markClaimSubmitted({ claims: original }, 'WMP-A1B2-C3D4-C0001', '2025-01-01T00:00:00.000Z')

      expect(original[0]).toEqual({ claimNumber: 'WMP-A1B2-C3D4-C0001', status: ClaimStatus.IN_PROGRESS })
    })
  })
})
