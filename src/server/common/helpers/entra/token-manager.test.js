import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import {
  clearTokenState,
  createTokenRequestParams,
  isTokenExpired,
  refreshToken
} from '~/src/server/common/helpers/entra/token-manager.js'

vi.mock('~/src/server/common/helpers/retry.js')

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Token Manager', () => {
  beforeEach(() => {
    config.set('entra', {
      tokenEndpoint: 'https://login.microsoftonline.com',
      tenantId: 'mock-tenant-id',
      clientId: 'mock-client-id',
      clientSecret: 'mock-client-secret'
    })
    clearTokenState()
    vi.clearAllMocks()

    retry.mockImplementation((operation) => operation())
  })

  describe('isTokenExpired', () => {
    test('returns true when no expiry time provided', () => {
      expect(isTokenExpired(null)).toBe(true)
    })

    test('returns true when token is expired', () => {
      const expiredTime = Date.now() - 1000 // 1 second ago
      expect(isTokenExpired(expiredTime)).toBe(true)
    })

    test('returns true when token expires within 5 minutes', () => {
      const almostExpiredTime = Date.now() + 4 * 60 * 1000 // 4 minutes from now
      expect(isTokenExpired(almostExpiredTime)).toBe(true)
    })

    test('returns false when token is valid and not near expiry', () => {
      const validTime = Date.now() + 10 * 60 * 1000 // 10 minutes from now
      expect(isTokenExpired(validTime)).toBe(false)
    })
  })

  describe('createTokenRequestParams', () => {
    test('creates correct URL search params', () => {
      const params = createTokenRequestParams('client-id', 'test-scope', 'secret')
      const paramsObject = Object.fromEntries(params)

      expect(paramsObject).toEqual({
        client_id: 'client-id',
        scope: 'test-scope',
        client_secret: 'secret',
        grant_type: 'client_credentials'
      })
    })
  })

  describe('refreshToken', () => {
    test('successfully refreshes token', async () => {
      const mockToken = 'new-access-token'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: mockToken,
            expires_in: 3600
          })
      })

      const token = await refreshToken()

      expect(token).toBe(mockToken)

      const [[calledUrl, calledOptions]] = mockFetch.mock.calls

      expect(calledUrl).toBe('https://login.microsoftonline.com/mock-tenant-id/oauth2/v2.0/token')
      expect(calledOptions.method).toBe('POST')
      expect(calledOptions.headers['Content-Type']).toBe('application/x-www-form-urlencoded')

      const bodyParams = new URLSearchParams(calledOptions.body)
      expect(Object.fromEntries(bodyParams)).toEqual({
        client_id: 'mock-client-id',
        scope: 'mock-client-id/.default',
        client_secret: 'mock-client-secret',
        grant_type: 'client_credentials'
      })
    })

    test('throws error when token refresh fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Invalid credentials'),
        json: () =>
          Promise.resolve({
            error: 'invalid_request',
            error_description: 'Invalid credentials'
          })
      })

      await expect(refreshToken()).rejects.toThrow('Invalid credentials')
    })

    test('throws error for a malformed token response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: null
          })
      })

      await expect(refreshToken()).rejects.toThrow('Invalid token response: missing or invalid access_token')
    })
  })
})
