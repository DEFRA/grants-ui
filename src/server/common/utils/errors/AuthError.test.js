// AuthError.test.js
import { describe, expect, it, vi } from 'vitest'
import { AuthError } from './AuthError'

describe('AuthError', () => {
  const mockBaseErrorLog = vi.fn()
  const MockBaseError = class {
    log = mockBaseErrorLog
  }
  Object.setPrototypeOf(AuthError.prototype, new MockBaseError())

  it('should log with generic auth logging details if no request is passed', () => {
    const authError = new AuthError({
      message: 'Authentication failed',
      status: 401,
      reason: 'invalid_details',
      source: 'test'
    })

    authError.log()

    expect(mockBaseErrorLog).toHaveBeenCalledWith(null, {})
  })

  it('should log user and organisation details when request contains auth credentials with profile', () => {
    const authError = new AuthError({
      message: 'Authentication failed',
      status: 401,
      reason: 'invalid_details',
      source: 'test'
    })

    const mockRequest = {
      auth: {
        credentials: {
          profile: { contactId: 'user123', currentRelationshipId: 'org456' },
          token: 'abcd1234',
          refreshToken: 'refresh1234'
        }
      }
    }

    authError.log(mockRequest)

    expect(mockBaseErrorLog).toHaveBeenCalledWith(mockRequest, {
      userId: 'user123',
      organisationId: 'org456',
      profileData: {
        hasToken: true,
        hasRefreshToken: true,
        hasProfile: true,
        profileKeys: ['contactId', 'currentRelationshipId'],
        tokenLength: 8
      }
    })
  })

  it('should handle requests without auth credentials gracefully', () => {
    const authError = new AuthError({
      message: 'Authentication failed',
      status: 401,
      reason: 'invalid_details',
      source: 'test'
    })

    const mockRequest = { auth: {} }

    authError.log(mockRequest)

    expect(mockBaseErrorLog).toHaveBeenCalledWith(mockRequest, {})
  })

  it('should extract authLoggingData correctly when profile data is missing', () => {
    const authError = new AuthError({
      message: 'Authentication failed',
      status: 401,
      reason: 'invalid_details',
      source: 'test'
    })

    const mockRequest = {
      auth: {
        credentials: {
          token: 'abcd1234'
        }
      }
    }

    authError.log(mockRequest)

    expect(mockBaseErrorLog).toHaveBeenCalledWith(mockRequest, {
      profileData: {
        hasToken: true,
        hasRefreshToken: false,
        hasProfile: false,
        profileKeys: [],
        tokenLength: 8
      }
    })
  })
})
