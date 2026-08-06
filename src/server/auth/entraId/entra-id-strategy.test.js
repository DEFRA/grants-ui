import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getEntraIdOidcOptions } from './entra-id-strategy.js'
import { config } from '~/src/config/config.js'
import { WebIdentityTokenProvider, MockProvider } from '@defra/hapi-auth-oidc'

vi.mock('~/src/config/config.js')
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: { AUTH: { ENTRA_ID_CONFIG: 'ENTRA_ID_CONFIG' } }
}))
vi.mock('@defra/hapi-auth-oidc', () => ({
  WebIdentityTokenProvider: vi.fn(function WebIdentityTokenProvider(options) {
    this.options = options
    this.type = 'federated'
  }),
  MockProvider: vi.fn(function MockProvider(options) {
    this.options = options
    this.type = 'federated'
  })
}))

const DEFAULT_CONFIG = {
  'entraId.tenantId': 'common',
  'entraId.discoveryUri': 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
  'entraId.clientId': 'mock-client-id',
  'entraId.scope': 'openid profile email offline_access user.read',
  'entraId.loginCallbackUri': '/login/callback',
  'entraId.useHttp': false,
  'entraId.federatedCredentials.enableMocking': false,
  'entraId.federatedCredentials.audience': 'grants-ui',
  'entraId.federatedCredentials.earlyRefreshMs': 0,
  'entraId.cookie.password': 'super-secure-cookie-password',
  'entraId.cookie.isSecure': true,
  'entraId.cookie.isSameSite': 'Lax',
  cdpEnvironment: 'local',
  baseUrl: '',
  isProduction: false
}

describe('getEntraIdOidcOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.get.mockImplementation((key) => DEFAULT_CONFIG[key])
    config.default.mockImplementation((key) => DEFAULT_CONFIG[key])
  })

  it('builds oidc options derived from tenantId when discoveryUri is not overridden', () => {
    const result = getEntraIdOidcOptions()

    expect(result.oidc).toMatchObject({
      clientId: 'mock-client-id',
      discoveryUri: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
      useHttp: false,
      loginCallbackUri: '/login/callback',
      scope: 'openid profile email offline_access user.read',
      externalBaseUrl: 'https://grants-ui.local.cdp-int.defra.cloud',
      responseMode: 'query'
    })
  })

  it('uses the explicit discoveryUri override when it differs from the schema default', () => {
    config.get.mockImplementation((key) =>
      key === 'entraId.discoveryUri' ? 'https://example.com/.well-known/openid-configuration' : DEFAULT_CONFIG[key]
    )

    const result = getEntraIdOidcOptions()

    expect(result.oidc.discoveryUri).toBe('https://example.com/.well-known/openid-configuration')
  })

  it('uses the explicit baseUrl override instead of the derived one when set', () => {
    config.get.mockImplementation((key) => (key === 'baseUrl' ? 'https://grants-ui.example.com' : DEFAULT_CONFIG[key]))

    const result = getEntraIdOidcOptions()

    expect(result.oidc.externalBaseUrl).toBe('https://grants-ui.example.com')
  })

  it('always uses query response mode, including in production', () => {
    config.get.mockImplementation((key) => (key === 'isProduction' ? true : DEFAULT_CONFIG[key]))

    const result = getEntraIdOidcOptions()

    // form_post is a cross-site POST from Azure, which browsers withhold SameSite=Lax cookies on -
    // both the PKCE state cookie and the app's yar cookie. Regression test for that: query mode
    // must never depend on environment.
    expect(result.oidc.responseMode).toBe('query')
  })

  it('builds a WebIdentityTokenProvider with the configured audience when mocking is disabled', () => {
    const result = getEntraIdOidcOptions()

    expect(WebIdentityTokenProvider).toHaveBeenCalledWith({ audience: ['grants-ui'], earlyRefreshMs: 0 })
    expect(result.oidc.authProvider).toBeInstanceOf(WebIdentityTokenProvider)
    expect(MockProvider).not.toHaveBeenCalled()
  })

  it('builds a MockProvider instead when federatedCredentials.enableMocking is set', () => {
    config.get.mockImplementation((key) =>
      key === 'entraId.federatedCredentials.enableMocking' ? true : DEFAULT_CONFIG[key]
    )

    const result = getEntraIdOidcOptions()

    expect(MockProvider).toHaveBeenCalledWith({})
    expect(result.oidc.authProvider).toBeInstanceOf(MockProvider)
    expect(WebIdentityTokenProvider).not.toHaveBeenCalled()
  })

  it('returns cookieOptions built from entraId.cookie config', () => {
    const result = getEntraIdOidcOptions()

    expect(result.cookieOptions).toEqual({
      password: 'super-secure-cookie-password',
      isSecure: true,
      isSameSite: 'Lax'
    })
  })
})
