import { vi } from 'vitest'
import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'

vi.mock('@hapi/wreck')
vi.mock('~/src/config/config.js')

import { getOidcConfig } from './get-oidc-config.js'

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

  test('fetches OIDC configuration from well-known URL', async () => {
    Wreck.get.mockResolvedValue({
      payload: mockPayload
    })

    const result = await getOidcConfig()

    expect(Wreck.get).toHaveBeenCalledWith(mockOpenIdConfigUrl, {
      json: true
    })
    expect(result).toEqual(mockPayload)
  })

  test('fetches OIDC configuration from custom URL', async () => {
    Wreck.get.mockResolvedValue({
      payload: mockPayload
    })

    const customOIDCConfigUrl = 'https://custom-url.com/.well-known/openid-configuration'

    const result = await getOidcConfig(customOIDCConfigUrl)

    expect(Wreck.get).not.toHaveBeenCalledWith(mockOpenIdConfigUrl, {
      json: true
    })

    expect(Wreck.get).toHaveBeenCalledWith(customOIDCConfigUrl, {
      json: true
    })

    expect(result).toEqual(mockPayload)
  })

  test('handles network errors when fetching OIDC config', async () => {
    const networkError = new Error('Network request failed')
    Wreck.get.mockRejectedValue(networkError)

    await expect(getOidcConfig()).rejects.toThrow('Network request failed')
    expect(Wreck.get).toHaveBeenCalledWith(mockOpenIdConfigUrl, {
      json: true
    })
  })

  test('handles invalid JSON responses', async () => {
    const jsonError = new Error('Invalid JSON')
    Wreck.get.mockRejectedValue(jsonError)

    await expect(getOidcConfig()).rejects.toThrow('Invalid JSON')
  })
})
