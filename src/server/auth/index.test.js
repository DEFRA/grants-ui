import { vi } from 'vitest'
import Cookie from '@hapi/cookie'
import Hapi from '@hapi/hapi'
import Yar from '@hapi/yar'
import { auth } from '~/src/server/auth/index.js'
import { getSignOutUrl } from '~/src/server/auth/get-sign-out-url.js'
import { nunjucksConfig } from '~/src/config/nunjucks/nunjucks.js'
import { contentSecurityPolicy } from '~/src/plugins/content-security-policy.js'
import { YarKeys } from '~/src/server/common/constants/session-keys.js'
import permissionsPlugin from '~/src/plugins/permissions.js'
import { fetchBusinessPermissions } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchBusinessPermissions: vi.fn()
}))

vi.mock('~/src/config/config.js', async () => {
  const { mockConfig } = await import('~/src/__mocks__/config-mocks.js')
  return mockConfig({
    'rateLimit.authEndpointUserLimit': 1000,
    'rateLimit.authEndpointPathLimit': 1000
  })
})

vi.mock('~/src/server/auth/state.js', () => ({
  validateState: vi.fn()
}))

vi.mock('~/src/server/auth/get-sign-out-url.js', () => ({
  getSignOutUrl: vi.fn().mockResolvedValue('https://defra-id.example/logout')
}))

vi.mock('~/src/config/nunjucks/context/context.js', () => ({
  context: () => ({ getAssetPath: (/** @type {string} */ assetPath) => `/public/${assetPath}` })
}))

vi.mock('~/src/server/auth/verify-token.js', () => ({
  verifyToken: vi.fn().mockResolvedValue(true)
}))

vi.mock('~/src/server/common/helpers/lock/application-lock.js', () => ({
  releaseAllApplicationLocksForOwnerFromApi: vi.fn().mockResolvedValue({ ok: true, releasedCount: 0 })
}))

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__/logger-mocks.js')
  return mockLogHelper()
})

const COOKIE_PASSWORD = 'at-least-32-characters-long-password-for-testing-purposes-only'

const STALE_CONTEXT = {
  grantCode: 'farm-payments',
  grantVersion: '1.0.0',
  clientRef: 'texels-ref-001',
  sbi: '106284736'
}

/**
 * Builds a Hapi server with the auth router registered. `authenticated` controls
 * whether the stub `defra-id` scheme reports an authenticated user (mirrors a
 * live session cookie surviving into the OIDC sign-out callback).
 * `securityHeaders` adds the production HSTS/frame/sniff options and the CSP
 * plugin so response header sizes match what the SSL sidecar sees.
 * @param {{ authenticated?: boolean, securityHeaders?: boolean }} [opts]
 */
async function buildServer({ authenticated = true, securityHeaders = false } = {}) {
  const server = Hapi.server(
    securityHeaders
      ? {
          routes: {
            security: {
              hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
              noSniff: true,
              xframe: true
            }
          }
        }
      : {}
  )
  if (securityHeaders) {
    await server.register(contentSecurityPolicy)
  }

  await server.register([
    Cookie,
    {
      plugin: Yar,
      options: {
        storeBlank: false,
        cookieOptions: { password: COOKIE_PASSWORD, isSecure: false }
      }
    }
  ])

  server.app.cache = /** @type {any} */ ({
    drop: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(true)
  })

  // A cookie strategy so `request.cookieAuth` exists, mirroring the live
  // `session` strategy from src/plugins/auth.js.
  server.auth.strategy('session', 'cookie', {
    cookie: { name: 'sid', password: COOKIE_PASSWORD, isSecure: false },
    validate: () => ({ isValid: false })
  })

  // Stub `defra-id`: `/auth/organisation` is registered with `auth: 'defra-id'`,
  // and `authenticated` toggles whether the sign-out callback still sees a session.
  server.auth.scheme('stub', () => ({
    authenticate(request, h) {
      if (!authenticated) {
        return h.unauthenticated(new Error('not authenticated'))
      }
      return h.authenticated({
        credentials: {
          contactId: '1100000001',
          crn: 'crn-1',
          sbi: 'sbi-1',
          sessionId: 'session-abc',
          token: 'stub-token'
        }
      })
    }
  }))
  server.auth.strategy('defra-id', 'stub')

  server.auth.default({ strategy: 'defra-id', mode: 'try' })

  // A helper route to seed the yar session before hitting a sign-out route, and
  // to read it back afterwards, exercising the real cookie round-trip.
  server.route({
    method: 'GET',
    path: '/test/seed',
    options: { auth: false },
    handler: (request, h) => {
      request.yar.set(YarKeys.GRANT_APPLICATION_CONTEXT, STALE_CONTEXT)
      request.yar.set('permissions:crn-1:sbi-1', [{ id: 'group-1', level: 'SUBMIT' }])
      request.yar.set('permissions:crn-2:sbi-1', [{ id: 'group-2', level: 'VIEW' }])
      request.yar.set('permissions:crn-1:sbi-2', [])
      request.yar.set('unrelated', 'preserved')
      return h.response({ ok: true })
    }
  })
  server.route({
    method: 'GET',
    path: '/test/read',
    options: { auth: false },
    handler: (request) => ({
      context: request.yar.get(YarKeys.GRANT_APPLICATION_CONTEXT) ?? null,
      permissions: request.yar.get('permissions:crn-1:sbi-1'),
      otherUserPermissions: request.yar.get('permissions:crn-2:sbi-1'),
      otherBusinessPermissions: request.yar.get('permissions:crn-1:sbi-2'),
      unrelated: request.yar.get('unrelated')
    })
  })

  await server.register([nunjucksConfig, auth])
  await server.register(permissionsPlugin)
  server.route({
    method: 'GET',
    path: '/test/permissions',
    handler: (request) => request.auth.credentials.permissions
  })
  await server.initialize()
  return server
}

/**
 * Seeds the stale context, follows the redirect chain for `url`, and returns the
 * context still held in the yar cookie afterwards.
 * @param {import('@hapi/hapi').Server} server
 * @param {string} url
 */
async function contextAfter(server, url) {
  const seed = await server.inject({ method: 'GET', url: '/test/seed' })
  const cookie = seed.headers['set-cookie']?.[0].split(';')[0]

  const res = await server.inject({
    method: 'GET',
    url,
    headers: { cookie }
  })

  const nextCookie = res.headers['set-cookie']?.find((value) => value.startsWith('session='))?.split(';')[0] ?? cookie
  const read = await server.inject({
    method: 'GET',
    url: '/test/read',
    headers: { cookie: nextCookie }
  })
  return { status: res.statusCode, cookie: nextCookie, ...JSON.parse(read.payload) }
}

describe('auth router - permissions cache clearing', () => {
  afterEach(() => vi.clearAllMocks())

  it.each([
    ['/auth/sign-out', true, 200],
    ['/auth/sign-out', false, 302],
    ['/auth/sign-out-oidc?state=xyz', true, 302],
    ['/auth/sign-out-oidc?state=xyz', false, 302]
  ])(
    'scopes permissions cleanup to the current user and business at %s (authenticated: %s)',
    async (url, authenticated, expectedStatus) => {
      const server = await buildServer({ authenticated })
      try {
        const result = await contextAfter(server, url)

        expect(result.status).toBe(expectedStatus)
        expect(result.permissions).toEqual(authenticated ? null : [{ id: 'group-1', level: 'SUBMIT' }])
        expect(result.otherUserPermissions).toEqual([{ id: 'group-2', level: 'VIEW' }])
        expect(result.otherBusinessPermissions).toEqual([])
        expect(result.unrelated).toBe('preserved')
        expect(fetchBusinessPermissions).not.toHaveBeenCalled()

        if (authenticated) {
          const freshPermissions = [{ id: 'group-1', level: 'VIEW' }]
          vi.mocked(fetchBusinessPermissions).mockResolvedValue(freshPermissions)
          const response = await server.inject({
            url: '/test/permissions',
            headers: { cookie: result.cookie }
          })

          expect(response.statusCode).toBe(200)
          expect(JSON.parse(response.payload)).toEqual(freshPermissions)
          expect(fetchBusinessPermissions).toHaveBeenCalledTimes(1)
        }
      } finally {
        await server.stop()
      }
    }
  )
})

describe('auth router - /auth/sign-out', () => {
  afterEach(() => vi.clearAllMocks())

  it('hands the Defra ID sign-out URL to the browser in the page body, not a Location header', async () => {
    const server = await buildServer({ authenticated: true })
    try {
      const response = await server.inject({ method: 'GET', url: '/auth/sign-out' })

      expect(response.statusCode).toBe(200)
      expect(response.headers.location).toBeUndefined()
      expect(response.headers['content-type']).toContain('text/html')
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.payload).toContain('http-equiv="refresh" content="0; url=https://defra-id.example/logout"')
      expect(getSignOutUrl).toHaveBeenCalledWith(expect.anything(), 'stub-token')
    } finally {
      await server.stop()
    }
  })

  it('keeps a >4KB Defra ID token out of the response headers and delivers it in the page body', async () => {
    // Mirrors the failure in TGC-1787: the SSL sidecar (nginx) rejects any upstream
    // response whose status line + headers exceed its 4KB buffer, and the token
    // alone can be that big for users linked to many businesses.
    const SIDECAR_HEADER_BUFFER_BYTES = 4096
    const toBase64Url = (/** @type {object} */ value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const relationship = (/** @type {number} */ i) =>
      `rel-${String(i).padStart(4, '0')}-4a5b-4c6d-8e9f-0a1b2c3d4e5f:10${String(i).padStart(7, '0')}:Example Farming Partnership ${i} Ltd:1:Agent:1`
    const payload = {
      sub: 'b1ed40af-8f20-42f9-a015-75c199850a51',
      contactId: '1100000001',
      firstName: 'Test',
      lastName: 'Agent',
      currentRelationshipId: 'rel-0001-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
      relationships: Array.from({ length: 20 }, (_, i) => relationship(i + 1)),
      roles: Array.from(
        { length: 20 },
        (_, i) => `rel-${String(i + 1).padStart(4, '0')}-4a5b-4c6d-8e9f-0a1b2c3d4e5f:Agent:3`
      )
    }
    const token = `${toBase64Url({ alg: 'RS256', typ: 'JWT' })}.${toBase64Url(payload)}.${'s'.repeat(342)}`
    expect(token.length).toBeGreaterThan(SIDECAR_HEADER_BUFFER_BYTES)
    const signOutUrl = `https://defra-id.example/signout?post_logout_redirect_uri=https://app.example/auth/sign-out-oidc&id_token_hint=${token}&state=eyJpZCI6ImFiYyJ9`
    vi.mocked(getSignOutUrl).mockResolvedValueOnce(signOutUrl)

    const server = await buildServer({ authenticated: true, securityHeaders: true })
    try {
      const response = await server.inject({ method: 'GET', url: '/auth/sign-out' })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-security-policy']).toBeDefined()
      expect(response.headers['strict-transport-security']).toBeDefined()
      expect(response.headers.location).toBeUndefined()

      // Serialise the header block the way the sidecar receives it over HTTP/1.1.
      const headerLines = Object.entries(response.headers).flatMap(([name, value]) =>
        (Array.isArray(value) ? value : [value]).map((v) => `${name}: ${v}`)
      )
      const headerBlock = `HTTP/1.1 ${response.statusCode} OK\r\n${headerLines.join('\r\n')}\r\n\r\n`
      expect(headerBlock).not.toContain(token)
      expect(Buffer.byteLength(headerBlock)).toBeLessThan(SIDECAR_HEADER_BUFFER_BYTES)

      // The browser still gets the complete URL, token included, in the body.
      const escapedUrl = signOutUrl.replaceAll('&', '&amp;')
      expect(response.payload).toContain(`http-equiv="refresh" content="0; url=${escapedUrl}"`)
      expect(response.payload).toContain(`href="${escapedUrl}"`)
    } finally {
      await server.stop()
    }
  })

  it('redirects an unauthenticated request straight home', async () => {
    const server = await buildServer({ authenticated: false })
    try {
      const response = await server.inject({ method: 'GET', url: '/auth/sign-out' })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('/')
      expect(getSignOutUrl).not.toHaveBeenCalled()
    } finally {
      await server.stop()
    }
  })
})

describe('auth router - GRANT_APPLICATION_CONTEXT clearing', () => {
  afterEach(() => vi.clearAllMocks())

  describe('/auth/sign-out-oidc', () => {
    it('clears the stored grant application context for an authenticated sign-out', async () => {
      const server = await buildServer({ authenticated: true })

      const { context } = await contextAfter(server, '/auth/sign-out-oidc?state=xyz')

      expect(context).toBeNull()
    })

    it('clears the stored grant application context even when the session is already gone', async () => {
      const server = await buildServer({ authenticated: false })

      const { context } = await contextAfter(server, '/auth/sign-out-oidc?state=xyz')

      expect(context).toBeNull()
    })

    it('drops the server-side session cache for an authenticated sign-out', async () => {
      const server = await buildServer({ authenticated: true })

      await contextAfter(server, '/auth/sign-out-oidc?state=xyz')

      expect(server.app.cache.drop).toHaveBeenCalledWith('session-abc')
    })
  })

  describe('/auth/organisation', () => {
    it('clears the stored grant application context on organisation switch', async () => {
      const server = await buildServer({ authenticated: true })

      const { context } = await contextAfter(server, '/auth/organisation')

      expect(context).toBeNull()
    })
  })
})
