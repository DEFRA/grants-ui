import { describe, it, expect } from 'vitest'
import { shouldRedirectToAgreements } from './agreements-redirect-helper.js'

describe('shouldRedirectToAgreements', () => {
  describe('farm-payments with offer statuses', () => {
    it.each(['OFFER_SENT', 'OFFER_WITHDRAWN', 'OFFER_ACCEPTED'])(
      'returns true when slug is farm-payments and status is %s',
      (gasStatus) => {
        const result = shouldRedirectToAgreements('farm-payments', gasStatus)
        expect(result).toBe(true)
      }
    )
  })

  describe('farm-payments with non-offer statuses', () => {
    it.each(['RECEIVED', 'AWAITING_AMENDMENTS', 'APPLICATION_WITHDRAWN'])(
      'returns false when slug is farm-payments and status is %s',
      (gasStatus) => {
        const result = shouldRedirectToAgreements('farm-payments', gasStatus)
        expect(result).toBe(false)
      }
    )
  })

  describe('non-farm-payments slugs', () => {
    it.each(['OFFER_SENT', 'OFFER_WITHDRAWN', 'OFFER_ACCEPTED'])(
      'returns false when slug is not farm-payments and status is %s',
      (gasStatus) => {
        const result = shouldRedirectToAgreements('other-grant', gasStatus)
        expect(result).toBe(false)
      }
    )
  })

  describe('edge cases', () => {
    it('returns false when slug is undefined', () => {
      const result = shouldRedirectToAgreements(undefined, 'OFFER_SENT')
      expect(result).toBe(false)
    })

    it('returns false when gasStatus is undefined', () => {
      const result = shouldRedirectToAgreements('farm-payments', undefined)
      expect(result).toBe(false)
    })

    it('returns false when both are undefined', () => {
      const result = shouldRedirectToAgreements(undefined, undefined)
      expect(result).toBe(false)
    })
  })
})
