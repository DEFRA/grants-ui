import { vi } from 'vitest'
import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'
import { config } from '~/src/config/config.js'
import { clearCachedBackendServiceToken, getBackendServiceToken } from './backend-service-token.js'

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

const configValues = {
  'session.cache.webIdentity.audience': 'grants-ui-backend',
  cdpEnvironment: 'test'
}

describe('backend-service-token', () => {
  beforeEach(() => {
    clearCachedBackendServiceToken()
    config.get.mockImplementation((key) => configValues[key])
    mockGetCredentials.mockReset()
    mockMockProviderGetCredentials.mockReset()
    WebIdentityTokenProvider.mockClear()
    MockProvider.mockClear()
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    mockLogger.error.mockClear()
  })

  afterEach(() => {
    configValues.cdpEnvironment = 'test'
  })

  describe('getBackendServiceToken', () => {
    test('creates the provider with the configured audience and an early-refresh window covering a request', async () => {
      mockGetCredentials.mockResolvedValue('a-token')

      await getBackendServiceToken()

      expect(WebIdentityTokenProvider).toHaveBeenCalledWith({
        audience: ['grants-ui-backend'],
        earlyRefreshMs: 20_000
      })
    })

    test('returns the token from the provider', async () => {
      mockGetCredentials.mockResolvedValue('a-token')

      const token = await getBackendServiceToken()

      expect(token).toBe('a-token')
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('audience=grants-ui-backend'))
    })

    test('reuses the same provider instance across calls', async () => {
      mockGetCredentials.mockResolvedValue('a-token')

      await getBackendServiceToken()
      await getBackendServiceToken()

      expect(WebIdentityTokenProvider).toHaveBeenCalledTimes(1)
      expect(mockGetCredentials).toHaveBeenCalledTimes(2)
    })

    test('logs a warning and returns undefined when no token is available', async () => {
      mockGetCredentials.mockResolvedValue(null)

      const token = await getBackendServiceToken()

      expect(token).toBeUndefined()
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('no Web Identity token available'))
    })

    test('passes our logger through to the provider so its own [Web Identity] logs are captured', async () => {
      mockGetCredentials.mockResolvedValue('a-token')

      await getBackendServiceToken()

      expect(mockGetCredentials).toHaveBeenCalledWith(mockLogger)
    })

    test('does not throw if the provider resolves with no token (matches WebIdentityTokenProvider swallowing STS errors internally)', async () => {
      mockGetCredentials.mockResolvedValue(undefined)

      await expect(getBackendServiceToken()).resolves.toBeUndefined()
    })

    test('uses MockProvider instead of WebIdentityTokenProvider when running locally', async () => {
      configValues.cdpEnvironment = 'local'
      mockMockProviderGetCredentials.mockResolvedValue('a-mock-token')

      const token = await getBackendServiceToken()

      expect(token).toBe('a-mock-token')
      expect(MockProvider).toHaveBeenCalledTimes(1)
      expect(WebIdentityTokenProvider).not.toHaveBeenCalled()
    })
  })
})
