import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getOidcConfig } from './get-oidc-config.js'
import { getIdentityProviderOrigin } from './get-identity-provider-origin.js'

vi.mock('./get-oidc-config.js', () => ({
  getOidcConfig: vi.fn()
}))

describe('getIdentityProviderOrigin', () => {
  beforeEach(() => {
    vi.mocked(getOidcConfig).mockReset()
  })

  it('returns the origin of the identity provider authorization endpoint', async () => {
    vi.mocked(getOidcConfig).mockResolvedValue({
      authorization_endpoint: 'https://dcidmtest.b2clogin.com/tenant/policy/oauth2/v2.0/authorize?prompt=login'
    })

    await expect(getIdentityProviderOrigin()).resolves.toBe('https://dcidmtest.b2clogin.com')
  })

  it.each([
    { authorization_endpoint: undefined, description: 'missing' },
    { authorization_endpoint: 'not a URL', description: 'malformed' },
    { authorization_endpoint: 'http://identity.example.com/authorize', description: 'not HTTPS' }
  ])('returns null when the authorization endpoint is $description', async ({ authorization_endpoint }) => {
    vi.mocked(getOidcConfig).mockResolvedValue({ authorization_endpoint })

    await expect(getIdentityProviderOrigin()).resolves.toBeNull()
  })
})
