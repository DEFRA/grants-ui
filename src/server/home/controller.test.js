import * as Iron from '@hapi/iron'
import { seal } from '@hapi/iron'
import Jwt from '@hapi/jwt'
import Wreck from '@hapi/wreck'
import { createServer } from '~/src/server/index.js'

jest.mock('@hapi/wreck', () => ({
  get: jest.fn()
}))

jest.mock('@hapi/jwt', () => ({
  token: {
    decode: jest.fn(),
    verifyTime: jest.fn()
  }
}))

describe('#homeController', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    process.env.SESSION_COOKIE_PASSWORD =
      'the-password-must-be-at-least-32-characters-long'

    // Mock the well-known OIDC config before server starts
    Wreck.get.mockResolvedValue({
      payload: {
        authorization_endpoint: 'https://mock-auth/authorize',
        token_endpoint: 'https://mock-auth/token'
      }
    })
    // Mock cache setup
    const mockCache = {
      set: jest.fn(),
      get: jest.fn().mockResolvedValue({
        accountId: 'test-user-123',
        token: 'mock-token',
        refreshToken: 'mock-refresh-token'
      })
    }
    server = await createServer()
    server.app.cache = mockCache
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected response', async () => {
    const sessionId = 'test-session-id'

    // Mock session data
    const mockUserSession = {
      accountId: 'test-user-123',
      token: 'mock-token',
      refreshToken: 'mock-refresh-token'
    }
    // Store the session in cache
    await server.app.cache.set(sessionId, mockUserSession)

    // Mock token decode and verification to simulate valid token
    Jwt.token.decode.mockReturnValue({ exp: Date.now() + 10000 })
    Jwt.token.verifyTime.mockImplementation(() => undefined)

    // Use password from environment variable for cookie sealing
    const sealedCookie = await seal(
      { sessionId },
      process.env.SESSION_COOKIE_PASSWORD,
      Iron.defaults
    )

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/home',
      headers: {
        cookie: `sid=${encodeURIComponent(sealedCookie)}`
      }
    })

    expect(result).toEqual(
      expect.stringContaining('You are being redirected...')
    )
    expect(statusCode).toBe(302)
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
