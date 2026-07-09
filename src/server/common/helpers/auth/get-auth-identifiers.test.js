import { describe, expect, it } from 'vitest'
import { getAuthenticatedCrn, getAuthenticatedSbi, getAuthIdentifiers } from './get-auth-identifiers.js'

describe('getAuthIdentifiers', () => {
  it('returns canonical auth identifiers from credentials', () => {
    const request = {
      auth: {
        credentials: {
          sbi: 'business-123',
          crn: 'crn-123',
          contactId: 'contact-123',
          relationshipId: 'relationship-123',
          organisationName: 'Test Farm'
        }
      }
    }

    expect(getAuthIdentifiers(request)).toEqual({
      sbi: 'business-123',
      crn: 'crn-123',
      contactId: 'contact-123',
      relationshipId: 'relationship-123',
      organisationName: 'Test Farm'
    })
  })

  it('does not use organisationId as an SBI fallback', () => {
    const request = {
      auth: {
        credentials: {
          organisationId: 'customer-database-primary-key',
          crn: 'crn-123'
        }
      }
    }

    expect(getAuthIdentifiers(request).sbi).toBeUndefined()
  })

  it('uses sbi when both sbi and organisationId are present', () => {
    const request = {
      auth: {
        credentials: {
          sbi: 'business-123',
          organisationId: 'customer-database-primary-key',
          crn: 'crn-123'
        }
      }
    }

    expect(getAuthIdentifiers(request).sbi).toBe('business-123')
  })

  it('throws if auth credentials are missing', () => {
    expect(() => getAuthIdentifiers({ auth: {} })).toThrow('Missing auth credentials')
  })
})

describe('getAuthenticatedSbi', () => {
  it('returns the canonical SBI', () => {
    const request = {
      auth: {
        credentials: {
          sbi: 'business-123'
        }
      }
    }

    expect(getAuthenticatedSbi(request)).toBe('business-123')
  })

  it('throws if SBI is missing', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'crn-123'
        }
      }
    }

    expect(() => getAuthenticatedSbi(request)).toThrow('Missing SBI in credentials')
  })
})

describe('getAuthenticatedCrn', () => {
  it('returns the CRN', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'crn-123'
        }
      }
    }

    expect(getAuthenticatedCrn(request)).toBe('crn-123')
  })

  it('throws if CRN is missing', () => {
    const request = {
      auth: {
        credentials: {
          sbi: 'business-123'
        }
      }
    }

    expect(() => getAuthenticatedCrn(request)).toThrow('Missing CRN in credentials')
  })
})
