import { vi } from 'vitest'

export const mockHapiPino = (customLogger = {}) => ({
  register: (server) => {
    server.decorate('server', 'logger', {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      ...customLogger
    })
  },
  name: 'mock-hapi-pino'
})

export const mockHapiRequest = (customProps = {}) => ({
  method: 'GET',
  url: { pathname: '/test' },
  path: '/test',
  params: {},
  query: {},
  payload: {},
  state: {},
  auth: {
    isAuthenticated: true,
    credentials: {}
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  },
  server: {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    },
    app: {
      cache: {
        get: vi.fn(),
        set: vi.fn()
      }
    }
  },
  ...customProps
})

export const mockHapiResponseToolkit = (customMethods = {}) => ({
  redirect: vi.fn().mockReturnThis(),
  view: vi.fn().mockReturnThis(),
  response: vi.fn().mockReturnThis(),
  code: vi.fn().mockReturnThis(),
  type: vi.fn().mockReturnThis(),
  header: vi.fn().mockReturnThis(),
  state: vi.fn().mockReturnThis(),
  unstate: vi.fn().mockReturnThis(),
  takeover: vi.fn().mockReturnThis(),
  continue: Symbol('continue'),
  ...customMethods
})

export const mockHapiServer = (customProps = {}) => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  },
  register: vi.fn(),
  route: vi.fn(),
  decorate: vi.fn(),
  ext: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  inject: vi.fn(),
  initialize: vi.fn(),
  app: {
    cache: {
      get: vi.fn(),
      set: vi.fn()
    }
  },
  ...customProps
})

export const mockSsoRequest = (customProps = {}) => ({
  query: {},
  url: {
    pathname: '/test',
    search: ''
  },
  ...customProps
})

export const mockAuthRequest = (customProps = {}) => ({
  auth: {
    isAuthenticated: true,
    credentials: {
      crn: 'test-crn',
      relationships: []
    }
  },
  params: {},
  url: {
    pathname: '/test',
    search: ''
  },
  ...customProps
})

export const mockSimpleRequest = (customProps = {}) => ({
  method: 'GET',
  path: '/test',
  ...customProps
})

export const mockContext = (customProps = {}) => ({
  payload: {},
  ...customProps
})

/**
 * Mocks the global fetch function.
 * @returns {import('vitest').Mock} The mocked fetch function.
 */
export const mockFetch = () => {
  const mockFetch = vi.fn()
  global.fetch = mockFetch
  return mockFetch
}

/**
 *
 * @param response
 * @returns {import('vitest').Mock}
 */
export const mockFetchWithResponse = (response = {}) => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(response),
    text: vi.fn().mockResolvedValue(JSON.stringify(response)),
    ...response
  })
  global.fetch = mockFetch
  return mockFetch
}
