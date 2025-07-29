import { getCacheKey } from './get-cache-key-helper.js'

describe('getCacheKey', () => {
  it('returns userId, businessId, and grantId when all are present', () => {
    const request = {
      auth: {
        credentials: {
          id: 'user123',
          relationships: ['relationship123:business456']
        }
      },
      params: {
        slug: 'grant789'
      }
    }

    const result = getCacheKey(request)

    expect(result).toEqual({
      userId: 'user123',
      businessId: 'business456',
      grantId: 'grant789'
    })
  })

  it('throws error if userId is missing', () => {
    const request = {
      auth: {
        credentials: {
          relationships: ['relationship123:business456']
        }
      },
      params: {
        slug: 'grant789'
      }
    }

    expect(() => getCacheKey(request)).toThrow('Missing identity')
  })

  it('throws error if businessId is missing', () => {
    const request = {
      auth: {
        credentials: {
          id: 'user123',
          relationships: []
        }
      },
      params: {
        slug: 'grant789'
      }
    }

    expect(() => getCacheKey(request)).toThrow('Missing identity')
  })

  it('throws error if auth.credentials is missing', () => {
    const request = {
      auth: {}, // no credentials
      params: {
        slug: 'grant789'
      }
    }

    expect(() => getCacheKey(request)).toThrow('Missing identity')
  })

  it('throws error if grantId (params.slug) is missing', () => {
    const request = {
      auth: {
        credentials: {
          id: 'user123',
          relationships: ['relationship123:business456']
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
          id: 'user123',
          relationships: ['relationship123:business456']
        }
      }
      // no params property
    }

    expect(() => getCacheKey(request)).toThrow('Missing grantId')
  })
})
