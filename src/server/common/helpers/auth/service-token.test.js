import { vi } from 'vitest'
import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'
import { config } from '~/src/config/config.js'
import { getServiceToken, getWebIdentityTokenProvider } from './service-token.js'

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
        earlyRefreshMs
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
      mockGetCredentials.mockResolvedValue('a-token')

      const token = await getServiceToken(mockProvider, 'audience', 'label')

      expect(token).toBe('a-token')
      expect(mockLogger.info).toHaveBeenCalledWith('[label] Web Identity token ready (audience=audience)')
    })

    test('returns undefined and logs warning when token is null', async () => {
      mockGetCredentials.mockResolvedValue(null)

      const token = await getServiceToken(mockProvider, 'audience', 'label')

      expect(token).toBeUndefined()
      expect(mockLogger.warn).toHaveBeenCalledWith('[label] no Web Identity token available (audience=audience)')
    })

    test('returns undefined and logs warning when token is undefined', async () => {
      mockGetCredentials.mockResolvedValue(undefined)

      const token = await getServiceToken(mockProvider, 'audience', 'label')

      expect(token).toBeUndefined()
      expect(mockLogger.warn).toHaveBeenCalledWith('[label] no Web Identity token available (audience=audience)')
    })

    test('passes the logger to the provider', async () => {
      mockGetCredentials.mockResolvedValue('token')

      await getServiceToken(mockProvider, 'audience', 'label')

      expect(mockGetCredentials).toHaveBeenCalledWith(mockLogger)
    })
  })
})
