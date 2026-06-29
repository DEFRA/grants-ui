import { vi } from 'vitest'
import Wreck from '@hapi/wreck'
import { getOidcConfig, resetOidcConfigCache } from './get-oidc-config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

vi.mock('@hapi/wreck')
vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

const WELL_KNOWN_URL = 'https://example.com/.well-known/openid_configuration'

describe('getOidcConfig', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetOidcConfigCache()
    const { config } = await import('~/src/config/config.js')
    config.get.mockReturnValue(WELL_KNOWN_URL)
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

    const { config } = await import('~/src/config/config.js')
    Wreck.get.mockResolvedValue({
      payload: mockPayload
    })

    const result = await getOidcConfig()

    expect(config.get).toHaveBeenCalledWith('defraId.wellKnownUrl')
    expect(Wreck.get).toHaveBeenCalledWith(WELL_KNOWN_URL, {
      json: true,
      timeout: 10000
    })
    expect(result).toEqual(mockPayload)
  })

  test('retries then succeeds when an early attempt fails', async () => {
    const mockPayload = { authorization_endpoint: 'https://example.com/auth' }
    const blip = /** @type {Error & { code?: string }} */ (new Error('Transient blip'))
    blip.code = 'ECONNRESET'
    Wreck.get.mockRejectedValueOnce(blip).mockResolvedValueOnce({ payload: mockPayload })

    vi.useFakeTimers()
    const promise = getOidcConfig()
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toEqual(mockPayload)
    expect(Wreck.get).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledWith(LogCodes.AUTH.OIDC_CONFIG_FETCH_RETRY, {
      attempt: 1,
      maxAttempts: 3,
      wellKnownUrl: WELL_KNOWN_URL,
      code: 'ECONNRESET',
      errorMessage: 'Transient blip'
    })
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
    const mockPayload = { end_session_endpoint: 'https://example.com/logout' }
    Wreck.get.mockResolvedValue({ payload: mockPayload })

    const first = await getOidcConfig()
    const second = await getOidcConfig()

    expect(first).toEqual(mockPayload)
    expect(second).toEqual(mockPayload)
    // The well-known endpoint is only hit once across both calls.
    expect(Wreck.get).toHaveBeenCalledTimes(1)
  })

  test('clears the cache after a failed fetch so a later call re-fetches', async () => {
    const mockPayload = { end_session_endpoint: 'https://example.com/logout' }
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
