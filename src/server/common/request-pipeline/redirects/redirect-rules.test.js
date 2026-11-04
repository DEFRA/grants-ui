import { describe, expect, it } from 'vitest'
import { findRedirectRule } from './redirect-rules.js'

const rules = [
  {
    fromGrantsStatus: 'SUBMITTED,REOPENED',
    gasStatus: 'APPLICATION_WITHDRAWN',
    toGrantsStatus: 'CLEARED',
    toPath: '/start'
  },
  { fromGrantsStatus: 'SUBMITTED', gasStatus: 'APPLICATION_AMEND', toGrantsStatus: 'REOPENED', toPath: '/summary' },
  { fromGrantsStatus: 'SUBMITTED', gasStatus: 'default', toGrantsStatus: 'SUBMITTED', toPath: '/confirmation' }
]

describe('findRedirectRule', () => {
  it('returns the first rule whose statuses include the pair, comma-separated lists included', () => {
    expect(findRedirectRule('REOPENED', 'APPLICATION_WITHDRAWN', rules)).toBe(rules[0])
    expect(findRedirectRule('SUBMITTED', 'APPLICATION_AMEND', rules)).toBe(rules[1])
  })

  it("treats 'default' as matching any status for that field", () => {
    expect(findRedirectRule('SUBMITTED', 'RECEIVED', rules)).toBe(rules[2])
    expect(findRedirectRule('SUBMITTED', 'OFFER_SENT', [{ gasStatus: 'OFFER_SENT', toPath: '/agreement' }])).toEqual({
      gasStatus: 'OFFER_SENT',
      toPath: '/agreement'
    })
  })

  it('returns undefined when no rule matches', () => {
    expect(findRedirectRule('REOPENED', 'RECEIVED', rules)).toBeUndefined()
    expect(findRedirectRule('SUBMITTED', 'RECEIVED')).toBeUndefined()
  })
})
