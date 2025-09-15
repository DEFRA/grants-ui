import { getCacheKey, parseSessionKey } from './get-cache-key-helper.js'

describe('getCacheKey', () => {
  it('returns userId, organisationId, and grantId when all are present', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'user123',
          organisationId: 'business456'
        }
      },
      params: {
        slug: 'grant789'
      }
    }

    const result = getCacheKey(request)

    expect(result).toEqual({
      userId: 'user123',
      organisationId: 'business456',
      grantId: 'grant789'
    })
  })

  it('throws error if userId is missing', () => {
    const request = {
      auth: {
        credentials: {
          organisationId: 'business456'
        }
      },
      params: {
        slug: 'grant789'
      }
    }

    expect(() => getCacheKey(request)).toThrow('Missing user ID in credentials')
  })

  it('throws error if organisationId is missing', () => {
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

    expect(() => getCacheKey(request)).toThrow('Missing organisation ID in credentials')
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

  it('throws error if grantId (params.slug) is missing', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'user123',
          organisationId: 'business456'
        }
      },
      params: {}
    }

    expect(() => getCacheKey(request)).toThrow('Missing grantId')
  })

  it('throws error if params is missing', () => {
    const request = {
      auth: {
        credentials: {
          crn: 'user123',
          organisationId: 'business456'
        }
      }
      // no params property
    }

    expect(() => getCacheKey(request)).toThrow('Missing grantId')
  })
})

describe('parseSessionKey', () => {
  it('parses a valid session key into its components', () => {
    const key = 'user123:business456:grant789'
    const result = parseSessionKey(key)

    expect(result).toEqual({
      userId: 'user123',
      organisationId: 'business456',
      grantId: 'grant789'
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
    expect(() => parseSessionKey('user123:business456')).toThrow('Invalid session key format')
    expect(() => parseSessionKey('user123')).toThrow('Invalid session key format')
  })
})
