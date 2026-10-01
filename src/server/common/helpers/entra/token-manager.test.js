import { vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'
import { config } from '~/src/config/config.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { log, logger } from '~/src/server/common/helpers/logging/log.js'
import {
  clearTokenState,
  createClientSecretTokenRequestParams,
  createTokenRequestParams,
  getValidToken,
  isTokenExpired,
  refreshToken
} from '~/src/server/common/helpers/entra/token-manager.js'

vi.mock('~/src/server/common/helpers/retry.js')

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { LogCodes: actualLogCodes } = await vi.importActual('~/src/server/common/helpers/logging/log-codes.js')
  return {
    log: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    LogCodes: actualLogCodes
  }
})

const validWebIdentityToken = () => jwt.sign({}, 'test-secret', { expiresIn: '5m' })

const mockGetCredentials = vi.fn()
const mockStsCredentials = vi.fn()

vi.mock('@defra/hapi-auth-oidc', () => ({
  WebIdentityTokenProvider: vi.fn().mockImplementation(function WebIdentityTokenProvider() {
    this.getCredentials = mockGetCredentials
    this.stsClient = { config: { credentials: mockStsCredentials } }
  })
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Token Manager', () => {
  beforeEach(() => {
    config.set('entra', {
      tokenEndpoint: 'https://login.microsoftonline.com',
      tenantId: 'mock-tenant-id',
      clientId: 'mock-client-id',
      clientSecret: '',
      authMethod: 'web_identity',
      webIdentity: {
        audience: ['mock-audience']
      }
    })
    clearTokenState()
    vi.clearAllMocks()

    retry.mockImplementation((operation) => operation())
    mockGetCredentials.mockResolvedValue(validWebIdentityToken())
    mockStsCredentials.mockReset()
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
      const params = createTokenRequestParams('client-id', 'test-scope', 'assertion')
      const paramsObject = Object.fromEntries(params)

      expect(paramsObject).toEqual({
        client_id: 'client-id',
        scope: 'test-scope',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: 'assertion',
        grant_type: 'client_credentials'
      })
    })
  })

  describe('createClientSecretTokenRequestParams', () => {
    test('creates correct URL search params', () => {
      const params = createClientSecretTokenRequestParams('client-id', 'test-scope', 'secret')
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
    test('requests a Web Identity token with a short duration, not the library default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'new-access-token', expires_in: 3600 })
      })

      await refreshToken()

      expect(WebIdentityTokenProvider).toHaveBeenCalledWith(
        expect.objectContaining({ audience: ['mock-audience'], durationSeconds: 60 })
      )
    })

    test('successfully refreshes token using a Web Identity client assertion', async () => {
      const mockToken = 'new-access-token'
      const webIdentityToken = validWebIdentityToken()
      mockGetCredentials.mockResolvedValue(webIdentityToken)
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
      expect(mockGetCredentials).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.ENTRA_TOKEN_REFRESH_ATTEMPT, { authMethod: 'web_identity' })
      expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.ENTRA_TOKEN_REFRESH_SUCCESS, { authMethod: 'web_identity' })

      const [[calledUrl, calledOptions]] = mockFetch.mock.calls

      expect(calledUrl).toBe('https://login.microsoftonline.com/mock-tenant-id/oauth2/v2.0/token')
      expect(calledOptions.method).toBe('POST')
      expect(calledOptions.headers['Content-Type']).toBe('application/x-www-form-urlencoded')

      const bodyParams = new URLSearchParams(calledOptions.body)
      expect(Object.fromEntries(bodyParams)).toEqual({
        client_id: 'mock-client-id',
        scope: 'mock-client-id/.default',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: webIdentityToken,
        grant_type: 'client_credentials'
      })
    })

    test('throws error when token refresh fails, logging it as an Entra token endpoint failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Invalid credentials'),
        status: 401,
        statusText: 'Unauthorized'
      })

      await expect(refreshToken()).rejects.toThrow('Entra token refresh failed')

      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.ENTRA_TOKEN_ENDPOINT_ERROR,
        expect.objectContaining({ authMethod: 'web_identity', status: 401 })
      )
      expect(log).not.toHaveBeenCalledWith(LogCodes.SYSTEM.ENTRA_WEB_IDENTITY_ERROR, expect.anything())
    })

    test('throws error for a malformed token response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: null
          })
      })

      await expect(refreshToken()).rejects.toThrow('Entra token refresh failed')
    })

    test('throws error when the Web Identity token cannot be obtained, logging it as an STS failure', async () => {
      mockGetCredentials.mockRejectedValueOnce(new Error('sts unavailable'))

      await expect(refreshToken()).rejects.toThrow('Entra token refresh failed')
      expect(mockFetch).not.toHaveBeenCalled()

      expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.ENTRA_WEB_IDENTITY_ERROR, {
        audience: ['mock-audience'],
        errorMessage: 'sts unavailable'
      })
      expect(log).not.toHaveBeenCalledWith(LogCodes.SYSTEM.ENTRA_TOKEN_ENDPOINT_ERROR, expect.anything())
    })

    test('logs the underlying ECS task credential expiry when the Web Identity token cannot be obtained', async () => {
      mockGetCredentials.mockRejectedValueOnce(new Error('sts unavailable'))
      const expiration = new Date(Date.now() + 42_000)
      mockStsCredentials.mockResolvedValue({ expiration })

      await expect(refreshToken()).rejects.toThrow('Entra token refresh failed')

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(expiration.toISOString()))
    })

    test('throws error when the Web Identity token provider returns a stale token, logging it as an STS failure', async () => {
      const expiredToken = jwt.sign({}, 'test-secret', { expiresIn: '-5m' })
      mockGetCredentials.mockResolvedValueOnce(expiredToken)

      await expect(refreshToken()).rejects.toThrow('Entra token refresh failed')
      expect(mockFetch).not.toHaveBeenCalled()

      expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.ENTRA_WEB_IDENTITY_ERROR, {
        audience: ['mock-audience'],
        errorMessage: 'Web Identity token provider returned no valid token'
      })
    })

    test('logs the underlying ECS task credential expiry when the token returned is stale', async () => {
      const expiredToken = jwt.sign({}, 'test-secret', { expiresIn: '-5m' })
      mockGetCredentials.mockResolvedValueOnce(expiredToken)
      const expiration = new Date(Date.now() + 7_000)
      mockStsCredentials.mockResolvedValue({ expiration })

      await expect(refreshToken()).rejects.toThrow('Entra token refresh failed')

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(expiration.toISOString()))
    })

    test('does not throw if reading the underlying credential expiry itself fails', async () => {
      mockGetCredentials.mockRejectedValueOnce(new Error('sts unavailable'))
      mockStsCredentials.mockRejectedValue(new Error('cannot read credentials'))

      await expect(refreshToken()).rejects.toThrow('Entra token refresh failed')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('could not read underlying ECS task credential expiry')
      )
    })

    test('throws error when the Web Identity token provider returns no token, logging it as an STS failure', async () => {
      mockGetCredentials.mockResolvedValueOnce(undefined)

      await expect(refreshToken()).rejects.toThrow('Entra token refresh failed')
      expect(mockFetch).not.toHaveBeenCalled()

      expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.ENTRA_WEB_IDENTITY_ERROR, {
        audience: ['mock-audience'],
        errorMessage: 'Web Identity token provider returned no valid token'
      })
    })

    test('uses a client secret when authMethod is client_secret', async () => {
      config.set('entra.authMethod', 'client_secret')
      config.set('entra.clientSecret', 'a-client-secret')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'secret-access-token',
            expires_in: 3600
          })
      })

      const token = await refreshToken()

      expect(token).toBe('secret-access-token')
      expect(mockGetCredentials).not.toHaveBeenCalled()
      expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.ENTRA_TOKEN_REFRESH_ATTEMPT, { authMethod: 'client_secret' })

      const [[, calledOptions]] = mockFetch.mock.calls
      const bodyParams = new URLSearchParams(calledOptions.body)
      expect(Object.fromEntries(bodyParams)).toEqual({
        client_id: 'mock-client-id',
        scope: 'mock-client-id/.default',
        client_secret: 'a-client-secret',
        grant_type: 'client_credentials'
      })
    })

    test('throws error for an unrecognised authMethod', async () => {
      config.set('entra.authMethod', 'not-a-real-provider')

      await expect(refreshToken()).rejects.toThrow('Entra token refresh failed')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('getValidToken', () => {
    test('returns existing token if not expired', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            expires_in: 3600
          })
      })

      const firstToken = await getValidToken()
      expect(firstToken).toBe('new-access-token')
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const secondToken = await getValidToken()
      expect(secondToken).toBe('new-access-token')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('refreshes token if expired', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'expired-token',
            expires_in: 0
          })
      })

      const firstToken = await getValidToken()
      expect(firstToken).toBe('expired-token')
      expect(mockFetch).toHaveBeenCalledTimes(1)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            expires_in: 3600
          })
      })

      const newToken = await getValidToken()
      expect(newToken).toBe('new-access-token')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
