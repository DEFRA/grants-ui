import { vi } from 'vitest'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { logAuthFailure, logAuthDebugInfo, logTokenExchangeFailure, logSuccessfulSignIn } from './auth-logging.js'

describe('auth-logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('logs authentication failure with correct details when hasCredentials is false', () => {
    const request = {
      path: '/auth',
      auth: {
        isAuthenticated: false,
        strategy: 'oidc',
        mode: 'required',
        artifacts: null
      },
      headers: {
        'user-agent': 'test-agent',
        referer: 'http://example.com'
      },
      query: { state: 'test' }
    }
    const authErrorMessage = 'Invalid credentials'
    const hasCredentials = false

    logAuthFailure(request, authErrorMessage, hasCredentials)

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: expect.any(String), messageFunc: expect.any(Function) }),
      expect.objectContaining({
        path: '/auth',
        userId: 'unknown',
        error: 'Invalid credentials',
        isAuthenticated: false,
        strategy: 'oidc',
        mode: 'required',
        hasCredentials: false,
        artifacts: 'none',
        userAgent: 'test-agent',
        referer: 'http://example.com',
        queryParams: { state: 'test' }
      }),
      request
    )
  })

  test('logs authentication failure with hasCredentials=true for token exchange failure path', () => {
    const request = {
      path: '/auth',
      auth: {
        isAuthenticated: false,
        strategy: 'oidc',
        mode: 'required',
        artifacts: { token: 'partial' }
      },
      headers: {
        'user-agent': 'test-agent',
        referer: 'http://example.com'
      },
      query: { state: 'test', code: 'auth-code' }
    }

    logAuthFailure(request, 'Failed obtaining access token', true)

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: expect.any(String), messageFunc: expect.any(Function) }),
      expect.objectContaining({
        hasCredentials: true,
        artifacts: 'present'
      }),
      request
    )
  })

  test('logs authentication debug info with correct details', () => {
    const request = {
      path: '/auth',
      auth: {
        isAuthenticated: true,
        strategy: 'oidc',
        mode: 'optional',
        credentials: { token: 'test-token', profile: {} }
      },
      headers: {
        'user-agent': 'test-agent',
        referer: 'http://example.com'
      },
      query: { state: 'test' },
      state: { bell: 'cookie' },
      method: 'GET',
      server: { info: { protocol: 'https' } }
    }

    logAuthDebugInfo(request)

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: expect.any(String), messageFunc: expect.any(Function) }),
      expect.objectContaining({
        path: '/auth',
        isAuthenticated: true,
        strategy: 'oidc',
        mode: 'optional',
        hasCredentials: true,
        hasToken: true,
        hasProfile: true,
        userAgent: 'test-agent',
        referer: 'http://example.com',
        queryParams: { state: 'test' },
        authError: 'none',
        cookiesReceived: ['bell'],
        hasBellCookie: true,
        requestMethod: 'GET',
        isSecure: true
      }),
      request
    )
  })

  test('logs token exchange failure with correct troubleshooting details', () => {
    const request = {
      query: { state: 'test', code: 'test-code' },
      state: { bell: 'cookie' }
    }
    const hasCredentials = true

    logTokenExchangeFailure(request, hasCredentials)

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: expect.any(String), messageFunc: expect.any(Function) }),
      expect.objectContaining({
        userId: 'unknown',
        errorMessage:
          'Token exchange failure detected - Bell completed OAuth redirect but cannot exchange code for token',
        step: 'token_exchange_failure_analysis',
        troubleshooting: expect.objectContaining({
          issue: 'Failed obtaining access token',
          credentialsPresent: true
        }),
        requestContext: expect.objectContaining({
          query: { state: 'test', code: 'test-code' },
          cookies: ['bell'],
          hasStateParam: true,
          hasCodeParam: true
        })
      }),
      request
    )
  })

  test('logs successful sign-in with correct user details', () => {
    const profile = {
      contactId: 'user123',
      currentRelationshipId: 'org456',
      sessionId: 'session789'
    }
    const role = 'admin'
    const scope = ['read', 'write']

    logSuccessfulSignIn(profile, role, scope)

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: expect.any(String), messageFunc: expect.any(Function) }),
      expect.objectContaining({
        userId: 'user123',
        organisationId: 'org456',
        role: 'admin',
        scope: 'read, write',
        sessionId: 'session789'
      })
    )
  })
})
