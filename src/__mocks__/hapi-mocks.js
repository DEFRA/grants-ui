import { vi } from 'vitest'

/**
 * Creates a fake hapi-pino plugin that decorates the server with a stub logger.
 * @param {Record<string, unknown>} [customLogger] Extra logger methods to merge into the stub.
 * @returns {{ register: (server: { decorate: (target: string, name: string, value: unknown) => void }) => void, name: string }}
 */
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

/**
 * Creates a partial Hapi request object suitable for unit-testing handlers.
 * @param {Record<string, unknown>} [customProps] Properties to merge over the defaults.
 */
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

/**
 * Creates a partial Hapi response toolkit whose chainable methods are vitest spies.
 * @param {Record<string, unknown>} [customMethods] Methods to override on the toolkit.
 */
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

/**
 * Creates a partial Hapi server with vitest spies in place of lifecycle methods.
 * @param {Record<string, unknown>} [customProps] Properties to merge over the defaults.
 */
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

/**
 * Creates a minimal request shape used by the SSO callback tests.
 * @param {Record<string, unknown>} [customProps] Properties to merge over the defaults.
 */
export const mockSsoRequest = (customProps = {}) => ({
  query: {},
  url: {
    pathname: '/test',
    search: ''
  },
  ...customProps
})

/**
 * Creates a request shape pre-populated with authenticated credentials.
 * @param {Record<string, unknown>} [customProps] Properties to merge over the defaults.
 */
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

/**
 * Creates a bare-bones request shape with just method, path and app.
 * @param {Record<string, unknown>} [customProps] Properties to merge over the defaults.
 */
export const mockSimpleRequest = (customProps = {}) => ({
  method: 'GET',
  path: '/test',
  app: {},
  ...customProps
})

/**
 * Creates a minimal form-context-style object with a payload bag.
 * @param {Record<string, unknown>} [customProps] Properties to merge over the defaults.
 */
export const mockContext = (customProps = {}) => ({
  payload: {},
  ...customProps
})

/**
 * Creates a mock fetch response object for testing.
 * @param {MockFetchResponseOptions} [options]
 * @returns {MockFetchResponse}
 */
export const createMockFetchResponse = ({
  ok = true,
  status = 200,
  statusText = 'OK',
  data = null,
  text = ''
} = {}) => ({
  ok,
  status,
  statusText,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(text)
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
 * Replaces `global.fetch` with a spy that resolves to a response wrapping `response`.
 * @param {Record<string, unknown>} [response] Body merged into the resolved response and returned by json/text.
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

/**
 * @typedef {object} MockFetchResponseOptions
 * @property {boolean} [ok] Whether the response is successful (default `true`).
 * @property {number} [status] HTTP status code (default `200`).
 * @property {string} [statusText] HTTP status text (default `'OK'`).
 * @property {unknown} [data] Value resolved by `json()` (default `null`).
 * @property {string} [text] Value resolved by `text()` (default `''`).
 */

/**
 * @typedef {object} MockFetchResponse
 * @property {boolean} ok
 * @property {number} status
 * @property {string} statusText
 * @property {() => Promise<unknown>} json
 * @property {() => Promise<string>} text
 */
