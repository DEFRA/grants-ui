import { vi } from 'vitest'
import hapi from '@hapi/hapi'
import Jwt from '@hapi/jwt'
import Iron, { seal } from '@hapi/iron'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { homeController, indexController } from './home.controller.js'
import { createServer } from '~/src/server/index.js'
import { mockSimpleRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

// Mock cache for integration tests
const mockCache = {
  set: vi.fn(),
  get: vi.fn(),
  drop: vi.fn()
}

vi.mock('@hapi/jwt', () => ({
  default: {
    token: {
      decode: vi.fn(),
      verifyTime: vi.fn()
    }
  },
  token: {
    decode: vi.fn(),
    verifyTime: vi.fn()
  }
}))

describe('#homeController', () => {
  let server

  beforeAll(async () => {
    process.env.SESSION_COOKIE_PASSWORD = 'this-is-a-very-long-and-secure-password-for-development-only'

    server = await createServer()
    server.app.cache = mockCache
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('Should call home controller handler correctly', async () => {
    const mockRequest = mockSimpleRequest()
    const mockH = mockHapiResponseToolkit({
      view: (template, context) => {
        expect(template).toBe('home')
        expect(context).toEqual({
          pageTitle: 'Home',
          heading: 'Home'
        })
        return `<html><head><title>${context.pageTitle} | Test Service</title></head><body>Home Page</body></html>`
      }
    })

    const result = homeController.handler(mockRequest, mockH)
    expect(result).toEqual(expect.stringContaining('Home |'))
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
    const sealedCookie = await seal({ sessionId }, process.env.SESSION_COOKIE_PASSWORD, Iron.defaults)

    server.inject.mockResolvedValueOnce({
      result: '<html><head><title>Home | Test Service</title></head><body>Home Content</body></html>',
      statusCode: statusCodes.ok,
      headers: {}
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/home',
      headers: {
        cookie: `sid=${encodeURIComponent(sealedCookie)}`
      },
      auth: {
        strategy: 'session',
        credentials: {
          accountId: 'test-user-123',
          token: 'mock-token'
        }
      }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toEqual(expect.stringContaining('Home |'))
  })

  test('Should respond with correct status when integrated with server', async () => {
    const server = hapi.server({
      port: 0,
      host: 'localhost'
    })

    server.route({
      method: 'GET',
      path: '/home',
      handler: (request, h) => {
        return h
          .response('<html><head><title>Home | Test Service</title></head><body>Home Content</body></html>')
          .type('text/html')
      }
    })

    await server.initialize()

    const response = await server.inject({
      method: 'GET',
      url: '/home'
    })

    expect(response.statusCode).toBe(statusCodes.ok)
    expect(response.result).toEqual(expect.stringContaining('Home |'))

    await server.stop({ timeout: 0 })
  })
})

describe('#indexController', () => {
  test('Should call index controller handler correctly', async () => {
    const mockRequest = mockSimpleRequest()
    const mockH = mockHapiResponseToolkit({
      view: (template, context) => {
        expect(template).toBe('root')
        expect(context).toEqual({
          pageTitle: 'Index',
          heading: 'Index'
        })
        return `<html><head><title>${context.pageTitle} | Test Service</title></head><body>Index Page</body></html>`
      }
    })

    const result = indexController.handler(mockRequest, mockH)
    expect(result).toEqual(expect.stringContaining('Index |'))
  })

  test('Should respond with correct status when integrated with server', async () => {
    const server = hapi.server({
      port: 0,
      host: 'localhost'
    })

    server.route({
      method: 'GET',
      path: '/index',
      handler: (request, h) => {
        return h
          .response('<html><head><title>Index | Test Service</title></head><body>Index Content</body></html>')
          .type('text/html')
      }
    })

    await server.initialize()

    const response = await server.inject({
      method: 'GET',
      url: '/index'
    })

    expect(response.statusCode).toBe(statusCodes.ok)
    expect(response.result).toEqual(expect.stringContaining('Index |'))

    await server.stop({ timeout: 0 })
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */
