import { vi } from 'vitest'
import {
  getReferenceNumber,
  getCacheKey,
  parseSessionKey,
  setReferenceNumber,
  withReferenceNumber
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

  it('reads referenceNumber from request.app once the multi-application onPreHandler has moved it off the query', () => {
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
      app: { referenceNumber: 'REF-1' }
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

  it('returns the ref from the URL', () => {
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

  it('never reads a ref from session - identity belongs to the request, so a second tab cannot redirect this one', () => {
    const yar = makeYar({ grantCode: 'grant789', referenceNumber: 'REF-OTHER-TAB' })
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
    expect(yar.get).not.toHaveBeenCalled()
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

describe('getReferenceNumber', () => {
  it('returns the ref from the query', () => {
    expect(getReferenceNumber({ query: { ref: 'REF-1' } })).toBe('REF-1')
  })

  it('prefers the ref stashed on request.app over the query', () => {
    expect(getReferenceNumber({ app: { referenceNumber: 'REF-APP' }, query: { ref: 'REF-Q' } })).toBe('REF-APP')
  })

  it('falls back to the query when the stash is empty', () => {
    expect(getReferenceNumber({ app: {}, query: { ref: 'REF-Q' } })).toBe('REF-Q')
  })

  it('returns undefined when neither is set', () => {
    expect(getReferenceNumber({ app: {}, query: {} })).toBeUndefined()
    expect(getReferenceNumber({})).toBeUndefined()
  })

  it('ignores a ref outside the reference format, which would corrupt the colon-separated session key', () => {
    expect(getReferenceNumber({ query: { ref: 'INVALID:REF' } })).toBeUndefined()
    expect(getReferenceNumber({ query: { ref: 'a b' } })).toBeUndefined()
    expect(getReferenceNumber({ query: { ref: 'GLD-ABC-123' } })).toBe('GLD-ABC-123')
  })

  it('ignores a ref that is not a non-empty string', () => {
    expect(getReferenceNumber({ query: { ref: ['A', 'B'] } })).toBeUndefined()
    expect(getReferenceNumber({ query: { ref: '' } })).toBeUndefined()
  })
})

describe('setReferenceNumber', () => {
  it('stashes the new ref on request.app, removes the old one from the query and forgets the memoised envelope', () => {
    const request = {
      app: { referenceNumber: 'OLD', stateWithDefinition: Promise.resolve(null) },
      query: { ref: 'OLD', a: '1' }
    }

    setReferenceNumber(request, 'NEW')

    expect(request.app.referenceNumber).toBe('NEW')
    expect(request.query).toEqual({ a: '1' })
    expect(request.app.stateWithDefinition).toBeUndefined()
    expect(getReferenceNumber(request)).toBe('NEW')
  })

  it('clears the ref altogether when called without one', () => {
    const request = { app: { referenceNumber: 'OLD' }, query: { ref: 'OLD' } }

    setReferenceNumber(request, undefined)

    expect(request.app.referenceNumber).toBeUndefined()
    expect(request.query).toEqual({})
    expect(getReferenceNumber(request)).toBeUndefined()
  })

  it('copes with a request that has no app or query yet', () => {
    const request = {}

    setReferenceNumber(request, 'NEW')

    expect(request.app.referenceNumber).toBe('NEW')
    expect(request.query).toBeUndefined()
  })
})

describe('withReferenceNumber', () => {
  const requestWithRef = (ref) => ({ query: ref ? { ref } : {} })

  it('appends the request ref to a bare path', () => {
    expect(withReferenceNumber(requestWithRef('REF-1'), '/grant/summary')).toBe('/grant/summary?ref=REF-1')
  })

  it('returns the url untouched when the request has no ref', () => {
    expect(withReferenceNumber(requestWithRef(), '/grant/summary')).toBe('/grant/summary')
  })

  it('preserves query parameters already on the target', () => {
    const result = withReferenceNumber(requestWithRef('REF-1'), '/grant/summary?returnUrl=%2Ftasks&page=2')

    const params = new URLSearchParams(result.split('?')[1])
    expect(result.startsWith('/grant/summary?')).toBe(true)
    expect(params.get('returnUrl')).toBe('/tasks')
    expect(params.get('page')).toBe('2')
    expect(params.get('ref')).toBe('REF-1')
  })

  it('does not overwrite a ref the target already carries', () => {
    expect(withReferenceNumber(requestWithRef('REF-1'), '/grant/summary?ref=REF-2')).toBe('/grant/summary?ref=REF-2')
  })

  it('appends to an existing query string without re-encoding what is already there', () => {
    expect(withReferenceNumber(requestWithRef('REF-1'), '/grant/summary?returnUrl=%2Ftasks&page=2')).toBe(
      '/grant/summary?returnUrl=%2Ftasks&page=2&ref=REF-1'
    )
  })

  it('keeps a fragment at the end of the url', () => {
    expect(withReferenceNumber(requestWithRef('REF-1'), '/grant/summary#main')).toBe('/grant/summary?ref=REF-1#main')
    expect(withReferenceNumber(requestWithRef('REF-1'), '/grant/summary?a=1#main')).toBe(
      '/grant/summary?a=1&ref=REF-1#main'
    )
  })

  it('reads the ref stashed on request.app too', () => {
    expect(withReferenceNumber({ app: { referenceNumber: 'REF-1' }, query: {} }, '/grant/summary')).toBe(
      '/grant/summary?ref=REF-1'
    )
  })

  it('ignores a ref outside the reference format (letters, digits, hyphens), so nothing needs escaping', () => {
    expect(withReferenceNumber(requestWithRef('a b&c'), '/grant/summary')).toBe('/grant/summary')
    expect(withReferenceNumber(requestWithRef('gld-abc-123'), '/grant/summary')).toBe('/grant/summary?ref=gld-abc-123')
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
