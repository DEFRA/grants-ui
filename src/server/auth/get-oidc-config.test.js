import { vi } from 'vitest'
import Wreck from '@hapi/wreck'
import { getOidcConfig } from './get-oidc-config.js'

vi.mock('@hapi/wreck')
vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

describe('getOidcConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      json: true
    })
    expect(result).toEqual(mockPayload)
  })

  test('handles network errors when fetching OIDC config', async () => {
    const mockConfig = await import('~/src/config/config.js')
    mockConfig.config.get.mockReturnValue('https://example.com/.well-known/openid_configuration')

    const networkError = new Error('Network request failed')
    Wreck.get.mockRejectedValue(networkError)

    await expect(getOidcConfig()).rejects.toThrow('Network request failed')
    expect(Wreck.get).toHaveBeenCalledWith('https://example.com/.well-known/openid_configuration', {
      json: true
    })
  })

  test('handles invalid JSON responses', async () => {
    const mockConfig = await import('~/src/config/config.js')
    mockConfig.config.get.mockReturnValue('https://example.com/.well-known/openid_configuration')

    const jsonError = new Error('Invalid JSON')
    Wreck.get.mockRejectedValue(jsonError)

    await expect(getOidcConfig()).rejects.toThrow('Invalid JSON')
  })
})
