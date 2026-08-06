// @vitest-environment node
//
// index.test.js and entra-id-strategy.test.js fully mock @defra/hapi-auth-oidc, which is why the
// SameSite/form_post cookie bug and the deleted-vs-kept POST route decision were never caught by
// existing tests. This file registers the REAL library against a REAL Hapi server (only
// `openid-client`'s network-facing `discovery` call is stubbed) so the app's options are validated
// against the library's actual Joi schema, and the actual cookie policy sent over the wire is
// asserted rather than the config object that produced it.
//
// Requires `@defra/hapi-auth-oidc` in vitest.config.js's `test.server.deps.inline`: it's plain ESM
// with no transform needs, so Vitest externalizes it by default, and its internal
// `import 'openid-client'` then resolves via Node's native loader - bypassing the
// vi.mock('openid-client', ...) below entirely, which otherwise only intercepts imports that go
// through Vite's SSR module graph.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import Hapi from '@hapi/hapi'
import Cookie from '@hapi/cookie'
import Yar from '@hapi/yar'
import { config } from '~/src/config/config.js'

vi.mock('~/src/config/config.js')
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: { AUTH: { ENTRA_ID_CONFIG: 'ENTRA_ID_CONFIG', ENTRA_ID_AUTH_FAILURE: 'ENTRA_ID_AUTH_FAILURE' } }
}))

// Enough of a real Azure v2.0 discovery document for openid-client to build an authorization URL.
const FAKE_AZURE_METADATA = {
  issuer: 'https://login.microsoftonline.com/test-tenant/v2.0',
  authorization_endpoint: 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize',
  token_endpoint: 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/token',
  jwks_uri: 'https://login.microsoftonline.com/test-tenant/discovery/v2.0/keys',
  response_types_supported: ['code'],
  // Must be present or serverMetadata().supportsPKCE() is false and preLogin silently falls back
  // to the nonce flow instead of PKCE.
  code_challenge_methods_supported: ['S256']
}

// Only the network-facing `discovery` call is stubbed - everything else (preLogin, PKCE code
// generation, buildAuthorizationUrl, cookie state handling) runs for real.
vi.mock('openid-client', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    discovery: vi.fn().mockResolvedValue(new actual.Configuration(FAKE_AZURE_METADATA, 'test-client-id', {}))
  }
})

const YAR_COOKIE_PASSWORD = 'yar-cookie-password-at-least-32-characters-long'

const DEFAULT_CONFIG = {
  'entraId.tenantId': 'test-tenant',
  'entraId.discoveryUri': 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
  'entraId.clientId': 'test-client-id',
  'entraId.scope': 'openid profile email offline_access user.read',
  'entraId.loginCallbackUri': '/login/callback',
  'entraId.useHttp': false,
  // MockProvider avoids constructing a real AWS STSClient at registration time (WebIdentityTokenProvider
  // does this eagerly as a constructor default parameter).
  'entraId.federatedCredentials.enableMocking': true,
  'entraId.federatedCredentials.audience': 'grants-ui',
  'entraId.federatedCredentials.earlyRefreshMs': 0,
  'entraId.cookie.password': 'entra-id-cookie-password-at-least-32-characters-long',
  'entraId.cookie.isSecure': false,
  'entraId.cookie.isSameSite': 'Lax',
  'entraId.session.ttl': 14400000,
  cdpEnvironment: 'local',
  baseUrl: 'http://localhost:3000',
  isProduction: false
}

/**
 * @returns {Promise<import('@hapi/hapi').Server>}
 */
async function buildServer() {
  const entraIdAuth = (await import('./index.js')).default

  const server = Hapi.server()
  await server.register([
    Cookie,
    { plugin: Yar, options: { storeBlank: false, cookieOptions: { password: YAR_COOKIE_PASSWORD, isSecure: false } } },
    entraIdAuth
  ])
  return server
}

describe('entra-id-auth plugin against the real @defra/hapi-auth-oidc library', () => {
  beforeAll(() => {
    // Real PKCE crypto + Joi schema validation + plugin registration is inherently heavier than a
    // typical mocked unit test, and the default 5000ms budget flakes under the full suite's
    // parallel load (observed ~5.6s for the first test in a worker, well under 2s in isolation).
    vi.setConfig({ testTimeout: 15000 })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    config.get.mockImplementation((key) => DEFAULT_CONFIG[key])
    config.default.mockImplementation((key) =>
      key === 'entraId.discoveryUri' ? DEFAULT_CONFIG['entraId.discoveryUri'] : undefined
    )
  })

  it('registers against the real library without making any network call', async () => {
    const { discovery } = await import('openid-client')

    const server = await buildServer()

    // Registration proves the app's options satisfy the library's Joi.attempt validation
    // (hapi-auth-oidc.js's schema) - the fully-mocked unit tests can never prove this, and it's
    // the real guard against schema drift on a library upgrade.
    expect(server).toBeDefined()
    // getOidcConfig (and therefore discovery) is only invoked lazily inside login()/callback(),
    // never at registration - confirms no network I/O happens just from booting the plugin.
    expect(discovery).not.toHaveBeenCalled()
  })

  it('registers the OIDC state cookie as SameSite=Lax, matching query response mode', async () => {
    const server = await buildServer()

    // The library defaults isSameSite to 'None' (hapi-auth-oidc.js schema) - asserting the actual
    // registered cookie definition, not the config object passed in, is what pins the fix: query
    // mode needs Lax, and nothing downstream should silently drop back to the library default.
    expect(server.states.cookies['hapi-auth-oidc']).toMatchObject({
      isSameSite: 'Lax',
      isHttpOnly: true,
      encoding: 'iron',
      isSecure: false
    })
  })

  it('registers GET /login/callback and no POST variant', async () => {
    const server = await buildServer()

    const routes = server.table().map((route) => `${route.method} ${route.path}`)
    expect(routes).toContain('get /login/callback')
    expect(routes).not.toContain('post /login/callback')
  })

  it('GET /login redirects to Azure with response_mode=query and PKCE params, and sets a Lax cookie', async () => {
    const server = await buildServer()

    const response = await server.inject({ method: 'GET', url: '/login' })

    expect(response.statusCode).toBe(302)

    const location = new URL(response.headers.location)
    expect(location.origin + location.pathname).toBe(
      'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize'
    )
    expect(location.searchParams.get('response_mode')).toBe('query')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:3000/login/callback')

    // The actual wire header, not the cookieOptions object - this is what proves a browser will
    // still hold and return the cookie on Azure's redirect back to /login/callback.
    const stateCookie = response.headers['set-cookie'].find((cookie) => cookie.startsWith('hapi-auth-oidc='))
    expect(stateCookie).toContain('SameSite=Lax')
    expect(stateCookie).not.toContain('Secure')
  })

  it('sets Secure on the state cookie when entraId.cookie.isSecure is true', async () => {
    config.get.mockImplementation((key) => (key === 'entraId.cookie.isSecure' ? true : DEFAULT_CONFIG[key]))

    const server = await buildServer()
    const response = await server.inject({ method: 'GET', url: '/login' })

    const stateCookie = response.headers['set-cookie'].find((cookie) => cookie.startsWith('hapi-auth-oidc='))
    expect(stateCookie).toContain('Secure')
  })
})
