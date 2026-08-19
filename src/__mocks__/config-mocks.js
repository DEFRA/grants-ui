import { vi } from 'vitest'

/**
 * Mock the land-grants config module with `devTools.enabled` disabled.
 * @returns {{ config: { get: import('vitest').Mock } }}
 */
export const mockLandGrantsConfig = () => ({
  config: {
    get: vi.fn((/** @type {string} */ key) => {
      /** @type {Record<string, boolean>} */
      const values = {
        'devTools.enabled': false
      }
      return values[key]
    })
  }
})

/** @type {Map<string, unknown>} */
const stateValues = new Map()
/** @type {Map<string, unknown>} */
let stateDefaults = new Map()
/** @type {unknown} */
let stateFallback

/**
 * Feature-flag values a test can flip between cases, paired with
 * `mockConfigWithState` below.
 */
export const configState = {
  /**
   * @param {string} key
   * @param {unknown} value
   */
  set(key, value) {
    stateValues.set(key, value)
  },
  reset() {
    stateValues.clear()
    stateDefaults.forEach((value, key) => stateValues.set(key, value))
  },
  /** @param {string} key */
  get(key) {
    return stateValues.has(key) ? stateValues.get(key) : stateFallback
  }
}

/**
 * Mock the config module against the mutable `configState` above.
 * @param {object} [options]
 * @param {Record<string, unknown>} [options.defaults] - values restored by `configState.reset()`
 * @param {unknown} [options.fallback] - returned for a key that was never set
 * @returns {{ config: { get: import('vitest').Mock } }}
 */
export const mockConfigWithState = ({ defaults = {}, fallback } = {}) => {
  stateDefaults = new Map(Object.entries(defaults))
  stateFallback = fallback
  configState.reset()
  return {
    config: {
      get: vi.fn((/** @type {string} */ key) => configState.get(key))
    }
  }
}

/**
 * Mock the config module, resolving keys against a fixed value map.
 * @param {Record<string, unknown>} [configValues] - keyed config values to return
 * @returns {{ config: { get: import('vitest').Mock } }}
 */
export const mockConfig = (configValues = {}) => ({
  config: {
    get: vi.fn((/** @type {string} */ key) => configValues[key])
  }
})

/**
 * Mock the config module with a bare `get` stub returning `undefined`.
 * @returns {{ config: { get: import('vitest').Mock } }}
 */
export const mockConfigSimple = () => ({
  config: {
    get: vi.fn()
  }
})

/**
 * Build a config mock with chainable `withAuth` / `withBackend` helpers
 * that layer extra values onto the base set.
 * @param {Record<string, unknown>} [baseValues] - initial keyed config values
 * @returns {ConfigMock}
 */
export const createMockConfig = (baseValues = {}) => {
  /** @type {Record<string, unknown>} */
  let configValues = { ...baseValues }

  /** @type {ConfigMock} */
  const configMock = {
    config: {
      get: vi.fn((/** @type {string} */ key) => configValues[key])
    },
    withAuth: (/** @type {Record<string, unknown>} */ authValues = {}) => {
      configValues = {
        ...configValues,
        'session.cache.authToken': 'test-auth-token-123',
        'session.cache.encryptionKey': 'test-encryption-key-32-chars-long',
        'auth.azureClientId': 'test-client-id',
        'auth.azureClientSecret': 'test-client-secret',
        'auth.azureTenantId': 'test-tenant-id',
        ...authValues
      }
      return configMock
    },
    withBackend: (/** @type {Record<string, unknown>} */ backendValues = {}) => {
      configValues = {
        ...configValues,
        'session.cache.apiEndpoint': 'http://localhost:3001',
        'session.cache.authToken': 'backend-auth-token',
        'session.cache.encryptionKey': 'backend-encryption-key-32-chars',
        ...backendValues
      }
      return configMock
    }
  }

  return configMock
}

/**
 * @typedef {object} ConfigMock
 * @property {{ get: import('vitest').Mock }} config - config accessor with a mocked `get`
 * @property {(authValues?: Record<string, unknown>) => ConfigMock} withAuth - layer auth values, returns self
 * @property {(backendValues?: Record<string, unknown>) => ConfigMock} withBackend - layer backend values, returns self
 */
