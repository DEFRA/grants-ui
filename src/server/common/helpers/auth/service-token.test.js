import { vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'
import { config } from '~/src/config/config.js'
import { getServiceToken, getWebIdentityTokenProvider } from './service-token.js'

const SECRET = 'test-secret'
const validToken = () => jwt.sign({}, SECRET, { expiresIn: '5m' })
const expiredToken = () => jwt.sign({}, SECRET, { expiresIn: '-5m' })

const mockGetCredentials = vi.fn()
const mockMockProviderGetCredentials = vi.fn()

vi.mock('@defra/hapi-auth-oidc', () => ({
  WebIdentityTokenProvider: vi.fn().mockImplementation(function WebIdentityTokenProvider() {
    this.getCredentials = mockGetCredentials
  }),
  MockProvider: vi.fn().mockImplementation(function MockProvider() {
    this.getCredentials = mockMockProviderGetCredentials
  })
}))

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => {
  const singletonLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { logger: singletonLogger }
})

const { logger: mockLogger } = await import('~/src/server/common/helpers/logging/log.js')

describe('service-token', () => {
  beforeEach(() => {
    config.get.mockReturnValue('test')
    mockGetCredentials.mockReset()
    mockMockProviderGetCredentials.mockReset()
    WebIdentityTokenProvider.mockClear()
    MockProvider.mockClear()
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
  })

  describe('getWebIdentityTokenProvider', () => {
    test('creates a WebIdentityTokenProvider when not in local environment', () => {
      config.get.mockReturnValue('test')
      const audience = 'test-audience'
      const earlyRefreshMs = 1000

      const provider = getWebIdentityTokenProvider(audience, earlyRefreshMs)

      expect(provider).toBeInstanceOf(WebIdentityTokenProvider)
      expect(WebIdentityTokenProvider).toHaveBeenCalledWith({
        audience: [audience],
        earlyRefreshMs,
        durationSeconds: 60
      })
    })

    test('creates a MockProvider when in local environment', () => {
      config.get.mockReturnValue('local')

      const provider = getWebIdentityTokenProvider('any', 0)

      expect(provider).toBeInstanceOf(MockProvider)
      expect(MockProvider).toHaveBeenCalledWith({})
    })
  })

  describe('getServiceToken', () => {
    const mockProvider = { getCredentials: mockGetCredentials }

    test('returns the token and logs success when available', async () => {
      const token = validToken()
      mockGetCredentials.mockResolvedValue(token)

      const result = await getServiceToken(mockProvider, 'audience', 'label')

      expect(result).toBe(token)
      expect(mockLogger.info).toHaveBeenCalledWith('[label] Web Identity token ready (audience=audience)')
    })

    test('returns undefined and logs warning when the token is null', async () => {
      mockGetCredentials.mockResolvedValue(null)

      const token = await getServiceToken(mockProvider, 'audience', 'label')

      expect(token).toBeUndefined()
      expect(mockGetCredentials).toHaveBeenCalledTimes(1)
      expect(mockLogger.warn).toHaveBeenCalledWith('[label] no valid Web Identity token available (audience=audience)')
    })

    test('returns undefined and logs warning when the token is undefined', async () => {
      mockGetCredentials.mockResolvedValue(undefined)

      const token = await getServiceToken(mockProvider, 'audience', 'label')

      expect(token).toBeUndefined()
      expect(mockGetCredentials).toHaveBeenCalledTimes(1)
      expect(mockLogger.warn).toHaveBeenCalledWith('[label] no valid Web Identity token available (audience=audience)')
    })

    test('passes the logger to the provider', async () => {
      mockGetCredentials.mockResolvedValue(validToken())

      await getServiceToken(mockProvider, 'audience', 'label')

      expect(mockGetCredentials).toHaveBeenCalledWith(mockLogger)
    })

    test('does not retry when the token is stale - surfaces the failure immediately', async () => {
      mockGetCredentials.mockResolvedValueOnce(expiredToken()).mockResolvedValueOnce(validToken())

      const token = await getServiceToken(mockProvider, 'audience', 'label')

      expect(token).toBeUndefined()
      expect(mockGetCredentials).toHaveBeenCalledTimes(1)
      expect(mockLogger.warn).toHaveBeenCalledWith('[label] no valid Web Identity token available (audience=audience)')
    })

    test('treats an undecodable token as invalid', async () => {
      mockGetCredentials.mockResolvedValue('not-a-jwt')

      const token = await getServiceToken(mockProvider, 'audience', 'label')

      expect(token).toBeUndefined()
      expect(mockGetCredentials).toHaveBeenCalledTimes(1)
    })

    test('trusts a MockProvider token even though it is not a JWT', async () => {
      mockMockProviderGetCredentials.mockResolvedValue('not-a-jwt')
      const mockProviderInstance = new MockProvider({})

      const token = await getServiceToken(mockProviderInstance, 'audience', 'label')

      expect(token).toBe('not-a-jwt')
      expect(mockLogger.info).toHaveBeenCalledWith('[label] Web Identity token ready (audience=audience)')
    })

    test('logs how close the underlying ECS task credentials were to expiry when no valid token was obtained', async () => {
      mockGetCredentials.mockResolvedValue(null)
      const expiration = new Date(Date.now() + 42_000)
      const mockStsCredentials = vi.fn().mockResolvedValue({ expiration })
      const providerWithSts = {
        getCredentials: mockGetCredentials,
        stsClient: { config: { credentials: mockStsCredentials } }
      }

      await getServiceToken(providerWithSts, 'audience', 'label')

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining(expiration.toISOString()))
    })

    test('does not throw if the provider has no stsClient (e.g. MockProvider)', async () => {
      mockGetCredentials.mockResolvedValue(null)

      await expect(getServiceToken(mockProvider, 'audience', 'label')).resolves.toBeUndefined()
    })

    test('does not throw if reading the underlying credential expiry itself fails', async () => {
      mockGetCredentials.mockResolvedValue(null)
      const mockStsCredentials = vi.fn().mockRejectedValue(new Error('cannot read credentials'))
      const providerWithSts = {
        getCredentials: mockGetCredentials,
        stsClient: { config: { credentials: mockStsCredentials } }
      }

      await expect(getServiceToken(providerWithSts, 'audience', 'label')).resolves.toBeUndefined()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('could not read underlying ECS task credential expiry')
      )
    })
  })
})
