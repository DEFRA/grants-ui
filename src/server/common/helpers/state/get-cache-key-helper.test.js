import { vi } from 'vitest'
import {
  getCacheKey,
  parseSessionKey,
  setApplicationInSession,
  clearApplicationFromSession
} from './get-cache-key-helper.js'

/** A minimal in-memory stand-in for Hapi's `request.yar`. */
function makeYar(initial) {
  let stored = initial
  return {
    get: vi.fn(() => stored),
    set: vi.fn((_key, value) => {
      stored = value
    }),
    clear: vi.fn(() => {
      stored = undefined
    })
  }
}

describe('getCacheKey', () => {
  it('returns sbi and grantCode when all are present', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'user123',
          sbi: 'business456'
        }
      },
      params: {
        slug: 'grant789'
      }
    }

    const result = getCacheKey(request)

    expect(result).toEqual({
      sbi: 'business456',
      grantCode: 'grant789'
    })
  })

  it('throws error if userId is missing', () => {
    const request = {
      auth: {
        credentials: {
          sbi: 'business456'
        }
      },
      params: {
        slug: 'grant789'
      }
    }

    expect(() => getCacheKey(request)).toThrow('Missing CRN in credentials')
  })

  it('throws error if SBI is missing', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'user123'
        }
      },
      params: {
        slug: 'grant789'
      }
    }

    expect(() => getCacheKey(request)).toThrow('Missing SBI in credentials')
  })

  it('does not use organisationId as an SBI fallback', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'user123',
          organisationId: 'customer-database-primary-key'
        }
      },
      params: {
        slug: 'grant789'
      }
    }

    expect(() => getCacheKey(request)).toThrow('Missing SBI in credentials')
  })

  it('throws error if auth.credentials is missing', () => {
    const request = {
      auth: {}, // no credentials
      params: {
        slug: 'grant789'
      }
    }

    expect(() => getCacheKey(request)).toThrow('Missing auth credentials')
  })

  it('throws error if grantCode (params.slug) is missing', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'user123',
          sbi: 'business456'
        }
      },
      params: {}
    }

    expect(() => getCacheKey(request)).toThrow('Missing grantCode')
  })

  it('throws error if params is missing', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'user123',
          sbi: 'business456'
        }
      }
      // no params property
    }

    expect(() => getCacheKey(request)).toThrow('Missing grantCode')
  })

  it('includes referenceNumber when a ref query param is present', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'user123',
          sbi: 'business456'
        }
      },
      params: {
        slug: 'grant789'
      },
      query: {
        ref: 'REF-1'
      }
    }

    expect(getCacheKey(request)).toEqual({
      sbi: 'business456',
      grantCode: 'grant789',
      referenceNumber: 'REF-1'
    })
  })

  it('omits referenceNumber when there is no ref query param and nothing persisted', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'user123',
          sbi: 'business456'
        }
      },
      params: {
        slug: 'grant789'
      },
      query: {},
      yar: makeYar()
    }

    expect(getCacheKey(request)).toEqual({
      sbi: 'business456',
      grantCode: 'grant789'
    })
  })

  it("returns the URL ref without persisting anything to session (pure read; persisting is multiApplicationRedirect's job)", () => {
    const yar = makeYar()
    const request = {
      auth: { credentials: { crn: 'user123', sbi: 'business456' } },
      params: { slug: 'grant789' },
      query: { ref: 'REF-1' },
      yar
    }

    const result = getCacheKey(request)

    expect(result).toEqual({ sbi: 'business456', grantCode: 'grant789', referenceNumber: 'REF-1' })
    expect(yar.set).not.toHaveBeenCalled()
  })

  it('falls back to the session-persisted referenceNumber when the URL has none', () => {
    const yar = makeYar({ grantCode: 'grant789', referenceNumber: 'REF-1' })
    const request = {
      auth: { credentials: { crn: 'user123', sbi: 'business456' } },
      params: { slug: 'grant789' },
      query: {},
      yar
    }

    expect(getCacheKey(request)).toEqual({
      sbi: 'business456',
      grantCode: 'grant789',
      referenceNumber: 'REF-1'
    })
  })

  it('a new ref on the URL overrides the persisted one, without writing to session', () => {
    const yar = makeYar({ grantCode: 'grant789', referenceNumber: 'REF-1' })
    const request = {
      auth: { credentials: { crn: 'user123', sbi: 'business456' } },
      params: { slug: 'grant789' },
      query: { ref: 'REF-2' },
      yar
    }

    expect(getCacheKey(request)).toEqual({
      sbi: 'business456',
      grantCode: 'grant789',
      referenceNumber: 'REF-2'
    })
    expect(yar.set).not.toHaveBeenCalled()
  })

  it('ignores a persisted referenceNumber for a different grantCode', () => {
    const yar = makeYar({ grantCode: 'other-grant', referenceNumber: 'REF-1' })
    const request = {
      auth: { credentials: { crn: 'user123', sbi: 'business456' } },
      params: { slug: 'grant789' },
      query: {},
      yar
    }

    expect(getCacheKey(request)).toEqual({
      sbi: 'business456',
      grantCode: 'grant789'
    })
  })

  it('does not throw when request.yar is absent', () => {
    const request = {
      auth: { credentials: { crn: 'user123', sbi: 'business456' } },
      params: { slug: 'grant789' },
      query: {}
    }

    expect(() => getCacheKey(request)).not.toThrow()
    expect(getCacheKey(request)).toEqual({ sbi: 'business456', grantCode: 'grant789' })
  })
})

describe('setApplicationInSession', () => {
  it('writes grantCode and referenceNumber to session', () => {
    const yar = makeYar()

    setApplicationInSession({ yar, params: { slug: 'grant789' } }, 'REF-1')

    expect(yar.set).toHaveBeenCalledWith('referenceNumber', { grantCode: 'grant789', referenceNumber: 'REF-1' })
  })

  it('does not throw when request.yar is absent', () => {
    expect(() => setApplicationInSession({ params: { slug: 'grant789' } }, 'REF-1')).not.toThrow()
  })
})

describe('clearApplicationFromSession', () => {
  it('clears the session-persisted referenceNumber', () => {
    const yar = makeYar({ grantCode: 'grant789', referenceNumber: 'REF-1' })

    clearApplicationFromSession({ yar })

    expect(yar.clear).toHaveBeenCalledWith('referenceNumber')
  })

  it('does not throw when request.yar is absent', () => {
    expect(() => clearApplicationFromSession({})).not.toThrow()
  })
})

describe('parseSessionKey', () => {
  it('parses a valid session key into its components', () => {
    const key = 'business456:grant789'
    const result = parseSessionKey(key)

    expect(result).toEqual({
      sbi: 'business456',
      grantCode: 'grant789'
    })
  })

  it('throws error for empty string', () => {
    expect(() => parseSessionKey('')).toThrow('Invalid session key')
  })

  it('throws error for non-string input', () => {
    expect(() => parseSessionKey(null)).toThrow('Invalid session key')
    expect(() => parseSessionKey(123)).toThrow('Invalid session key')
  })

  it('throws error for missing parts', () => {
    expect(() => parseSessionKey('sbi')).toThrow('Invalid session key format')
  })
})
