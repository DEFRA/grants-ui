import { vi } from 'vitest'
import Wreck from '@hapi/wreck'
import { getOidcConfig } from './get-oidc-config.js'

vi.mock('@hapi/wreck')
vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

describe('getOidcConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('fetches OIDC configuration from well-known URL', async () => {
    const mockPayload = {
      authorization_endpoint: 'https://example.com/auth',
      token_endpoint: 'https://example.com/token',
      jwks_uri: 'https://example.com/keys',
      end_session_endpoint: 'https://example.com/logout'
    }

    const mockConfig = await import('~/src/config/config.js')
    mockConfig.config.get.mockReturnValue('https://example.com/.well-known/openid_configuration')

    Wreck.get.mockResolvedValue({
      payload: mockPayload
    })

    const result = await getOidcConfig()

    expect(mockConfig.config.get).toHaveBeenCalledWith('defraId.wellKnownUrl')
    expect(Wreck.get).toHaveBeenCalledWith('https://example.com/.well-known/openid_configuration', {
      json: true,
      timeout: 10000
    })
    expect(result).toEqual(mockPayload)
  })

  test('retries then succeeds when an early attempt fails', async () => {
    const mockConfig = await import('~/src/config/config.js')
    mockConfig.config.get.mockReturnValue('https://example.com/.well-known/openid_configuration')

    const mockPayload = { authorization_endpoint: 'https://example.com/auth' }
    Wreck.get.mockRejectedValueOnce(new Error('Transient blip')).mockResolvedValueOnce({ payload: mockPayload })

    vi.useFakeTimers()
    const promise = getOidcConfig()
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toEqual(mockPayload)
    expect(Wreck.get).toHaveBeenCalledTimes(2)
  })

  test('retries the configured number of times then throws the last error', async () => {
    const mockConfig = await import('~/src/config/config.js')
    mockConfig.config.get.mockReturnValue('https://example.com/.well-known/openid_configuration')

    const networkError = new Error('Network request failed')
    Wreck.get.mockRejectedValue(networkError)

    vi.useFakeTimers()
    const promise = getOidcConfig()
    promise.catch(() => {})
    await vi.runAllTimersAsync()

    await expect(promise).rejects.toThrow('Network request failed')
    expect(Wreck.get).toHaveBeenCalledTimes(3)
    expect(Wreck.get).toHaveBeenCalledWith('https://example.com/.well-known/openid_configuration', {
      json: true,
      timeout: 10000
    })
  })

  test('handles invalid JSON responses', async () => {
    const mockConfig = await import('~/src/config/config.js')
    mockConfig.config.get.mockReturnValue('https://example.com/.well-known/openid_configuration')

    const jsonError = new Error('Invalid JSON')
    Wreck.get.mockRejectedValue(jsonError)

    vi.useFakeTimers()
    const promise = getOidcConfig()
    promise.catch(() => {})
    await vi.runAllTimersAsync()

    await expect(promise).rejects.toThrow('Invalid JSON')
  })
})
