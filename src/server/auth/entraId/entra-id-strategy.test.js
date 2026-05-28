// entra-id-strategy.test.js
import { describe, expect, it, vi } from 'vitest'
import { getEntraIdOptions } from './entra-id-strategy'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { config } from '~/src/config/config.js'

vi.mock('~/src/server/auth/get-oidc-config.js')
vi.mock('~/src/config/config.js')

describe('getEntraIdOptions', () => {
  it('should return the correct options with OIDC configuration', async () => {
    const mockOidcConfig = {
      authorization_endpoint: 'https://example.com/oauth2/auth',
      token_endpoint: 'https://example.com/oauth2/token'
    }

    getOidcConfig.mockResolvedValue(mockOidcConfig)
    config.get.mockImplementation((key) => {
      switch (key) {
        case 'entraId.wellKnownUrl':
          return 'https://example.com/.well-known/openid-configuration'
        case 'session.cookie.password':
          return 'super-secure-cookie-password'
        case 'entraId.clientId':
          return 'mock-client-id'
        case 'entraId.clientSecret':
          return 'mock-client-secret'
        case 'session.cookie.secure':
          return true
        case 'entraId.redirectUrl':
          return 'https://example.com/callback'
        default:
          return undefined
      }
    })

    const result = await getEntraIdOptions()

    expect(result).toEqual({
      provider: {
        name: 'entra-id',
        protocol: 'oauth2',
        useParamsAuth: true,
        auth: 'https://example.com/oauth2/auth',
        token: 'https://example.com/oauth2/token',
        scope: ['openid', 'profile', 'email', 'offline_access'],
        profile: expect.any(Function)
      },
      password: 'super-secure-cookie-password',
      clientId: 'mock-client-id',
      clientSecret: 'mock-client-secret',
      isSecure: true,
      location: 'https://example.com/callback'
    })

    const mockCredentials = { id: 'user-id', email: 'user@example.com' }
    const profileResult = result.provider.profile(mockCredentials)
    expect(profileResult).toEqual(mockCredentials)
  })

  it('should throw an error when OIDC configuration fails', async () => {
    getOidcConfig.mockRejectedValue(new Error('Failed to fetch OIDC configuration'))

    await expect(getEntraIdOptions()).rejects.toThrow('Failed to fetch OIDC configuration')
  })
})
