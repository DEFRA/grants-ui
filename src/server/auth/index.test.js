import { vi } from 'vitest'
import Cookie from '@hapi/cookie'
import Hapi from '@hapi/hapi'
import Yar from '@hapi/yar'
import { auth } from '~/src/server/auth/index.js'
import { YarKeys } from '~/src/server/common/constants/session-keys.js'

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
 * @param {{ authenticated?: boolean }} [opts]
 */
async function buildServer({ authenticated = true } = {}) {
  const server = Hapi.server()

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
      return h.response({ ok: true })
    }
  })
  server.route({
    method: 'GET',
    path: '/test/read',
    options: { auth: false },
    handler: (request) => ({
      context: request.yar.get(YarKeys.GRANT_APPLICATION_CONTEXT) ?? null
    })
  })

  await server.register(auth)
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

  const nextCookie = res.headers['set-cookie']?.[0].split(';')[0] ?? cookie
  const read = await server.inject({
    method: 'GET',
    url: '/test/read',
    headers: { cookie: nextCookie }
  })
  return { status: res.statusCode, context: JSON.parse(read.payload).context }
}

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
