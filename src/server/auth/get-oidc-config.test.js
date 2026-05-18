import { vi } from 'vitest'
import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from './get-oidc-config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

vi.mock('@hapi/wreck')
vi.mock('~/src/config/config.js')
vi.mock('~/src/server/common/helpers/logging/log.js')

describe('getOidcConfig', () => {
  const mockOpenIdConfigUrl = 'https://example.com/.well-known/openid-configuration'

  const mockPayload = {
    authorization_endpoint: 'https://example.com/auth',
    token_endpoint: 'https://example.com/token',
    jwks_uri: 'https://example.com/keys',
    end_session_endpoint: 'https://example.com/logout'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    config.get.mockReturnValue(mockOpenIdConfigUrl)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('fetches OIDC configuration from well-known URL', async () => {
    Wreck.get.mockResolvedValue({
      payload: mockPayload
    })

    const result = await getOidcConfig()

    expect(config.get).toHaveBeenCalledWith('defraId.wellKnownUrl')
    expect(Wreck.get).toHaveBeenCalledWith(mockOpenIdConfigUrl, {
      json: true,
      timeout: 10000
    })
    expect(result).toEqual(mockPayload)
  })

  test('fetches OIDC configuration from custom URL', async () => {
    Wreck.get.mockResolvedValue({
      payload: mockPayload
    })

    const customOIDCConfigUrl = 'https://custom-url.com/.well-known/openid-configuration'

    const result = await getOidcConfig(customOIDCConfigUrl)

    expect(Wreck.get).not.toHaveBeenCalledWith(mockOpenIdConfigUrl, expect.anything())
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
    expect(log).toHaveBeenCalledWith(LogCodes.AUTH.OIDC_CONFIG_FETCH_RETRY, {
      attempt: 1,
      maxAttempts: 3,
      wellKnownUrl: mockOpenIdConfigUrl,
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
    expect(Wreck.get).toHaveBeenCalledWith(mockOpenIdConfigUrl, {
      json: true,
      timeout: 10000
    })
  })

  test('handles invalid JSON responses', async () => {
    const jsonError = new Error('Invalid JSON')
    Wreck.get.mockRejectedValue(jsonError)

    vi.useFakeTimers()
    const promise = getOidcConfig()
    promise.catch(() => {})
    await vi.runAllTimersAsync()

    await expect(promise).rejects.toThrow('Invalid JSON')
  })
})
