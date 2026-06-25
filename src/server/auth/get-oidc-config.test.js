import { vi } from 'vitest'
import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'
import { getOidcConfig, resetOidcConfigCache } from './get-oidc-config.js'

vi.mock('@hapi/wreck')
vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'log') {
        return { level: 'info', enabled: true, redact: [], format: 'pino-pretty' }
      }
      if (key === 'gitRepositoryName') {
        return 'grants-ui'
      }
      if (key === 'serviceVersion') {
        return '0.0.0'
      }
      return undefined
    })
  }
}))

const WELL_KNOWN_URL = 'https://example.com/.well-known/openid_configuration'

describe('getOidcConfig', () => {
  const mockPayload = {
    authorization_endpoint: 'https://example.com/auth',
    token_endpoint: 'https://example.com/token',
    jwks_uri: 'https://example.com/keys',
    end_session_endpoint: 'https://example.com/logout'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetOidcConfigCache()
    config.get.mockReturnValue(WELL_KNOWN_URL)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('fetches OIDC configuration from well-known URL', async () => {
    Wreck.get.mockResolvedValue({ payload: mockPayload })

    const result = await getOidcConfig()

    expect(config.get).toHaveBeenCalledWith('defraId.wellKnownUrl')
    expect(Wreck.get).toHaveBeenCalledWith(WELL_KNOWN_URL, {
      json: true,
      timeout: 10000
    })
    expect(result).toEqual(mockPayload)
  })

  test('fetches OIDC configuration from custom URL', async () => {
    Wreck.get.mockResolvedValue({ payload: mockPayload })

    const customOIDCConfigUrl = 'https://custom-url.com/.well-known/openid-configuration'
    const result = await getOidcConfig(customOIDCConfigUrl)

    expect(Wreck.get).not.toHaveBeenCalledWith(WELL_KNOWN_URL, expect.anything())
    expect(Wreck.get).toHaveBeenCalledWith(customOIDCConfigUrl, {
      json: true,
      timeout: 10000
    })
    expect(result).toEqual(mockPayload)
  })

  test('retries then succeeds when an early attempt fails', async () => {
    const blip = /** @type {Error & { code?: string }} */ (new Error('Transient blip'))
    blip.code = 'ECONNRESET'
    Wreck.get.mockRejectedValueOnce(blip).mockResolvedValueOnce({ payload: mockPayload })

    vi.useFakeTimers()
    const promise = getOidcConfig()
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toEqual(mockPayload)
    expect(Wreck.get).toHaveBeenCalledTimes(2)
  })

  test('retries the configured number of times then throws the last error', async () => {
    const networkError = new Error('Network request failed')
    Wreck.get.mockRejectedValue(networkError)

    vi.useFakeTimers()
    const promise = getOidcConfig()
    promise.catch(() => {})
    await vi.runAllTimersAsync()

    await expect(promise).rejects.toThrow('Network request failed')
    expect(Wreck.get).toHaveBeenCalledTimes(3)
    expect(Wreck.get).toHaveBeenCalledWith(WELL_KNOWN_URL, {
      json: true,
      timeout: 10000
    })
  })

  test('caches the discovery document and does not re-fetch on subsequent calls', async () => {
    Wreck.get.mockResolvedValue({ payload: mockPayload })

    const first = await getOidcConfig()
    const second = await getOidcConfig()

    expect(first).toEqual(mockPayload)
    expect(second).toEqual(mockPayload)
    // The well-known endpoint is only hit once across both calls.
    expect(Wreck.get).toHaveBeenCalledTimes(1)
  })

  test('clears the cache after a failed fetch so a later call re-fetches', async () => {
    Wreck.get.mockRejectedValue(new Error('Network request failed'))

    vi.useFakeTimers()
    const failing = getOidcConfig()
    failing.catch(() => {})
    await vi.runAllTimersAsync()
    await expect(failing).rejects.toThrow('Network request failed')
    expect(Wreck.get).toHaveBeenCalledTimes(3)

    Wreck.get.mockReset()
    Wreck.get.mockResolvedValue({ payload: mockPayload })

    await expect(getOidcConfig()).resolves.toEqual(mockPayload)
    expect(Wreck.get).toHaveBeenCalledTimes(1)
  })
})
