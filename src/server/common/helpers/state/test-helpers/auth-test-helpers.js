import { vi } from 'vitest'

const CRYPTO_ENCODING = {
  UTF8: 'utf8',
  BASE64: 'base64'
}

const AUTH_SCHEME = 'Basic'

export const TEST_BACKEND_URL = 'https://test-backend'
export const TEST_AUTH_TOKEN = 'test-auth-token'
export const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-chars-long'
export const TEST_REPOSITORY_NAME = 'test-repo'
export const TEST_SERVICE_VERSION = '1.0.0'

export const TEST_LOG_CONFIG = { enabled: false, redact: [], level: 'info', format: 'ecs' }

export const TEST_FOO_VALUE = 'bar'
export const TEST_USER_ID = 'user_test'
export const TEST_BUSINESS_ID = 'biz_test'
export const TEST_GRANT_SLUG = 'test-slug'

export const HTTP_STATUS_TEXT = {
  NOT_FOUND: 'Not Found',
  INTERNAL_SERVER_ERROR: 'Internal Server Error'
}

export const ERROR_TEXT = {
  NETWORK_ERROR: 'Network error',
  NO_CONTENT: 'No content',
  INVALID_URL: 'Invalid URL',
  ENCRYPTION_NOT_CONFIGURED: 'Encryption key not configured'
}

export const CONFIG_KEYS = {
  API_ENDPOINT: 'session.cache.apiEndpoint',
  AUTH_TOKEN: 'session.cache.authToken',
  ENCRYPTION_KEY: 'session.cache.encryptionKey',
  LOG: 'log',
  GIT_REPOSITORY_NAME: 'gitRepositoryName',
  SERVICE_VERSION: 'serviceVersion'
}

export const TEST_CONSTANTS = {
  UNKNOWN_KEY: 'unknown.key',
  CUSTOM_KEY: 'customKey',
  CUSTOM_VALUE: 'customValue',
  CUSTOM_BACKEND_URL: 'https://custom-backend'
}

export const MOCK_STATE_DATA = {
  DEFAULT: { state: { foo: TEST_FOO_VALUE } },
  SIMPLE: { foo: TEST_FOO_VALUE },
  WITH_STEP: { foo: TEST_FOO_VALUE, step: 1 }
}

export const HTTP_STATUS = {
  OK: 200,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
}

export const TEST_USER_IDS = {
  DEFAULT: TEST_USER_ID,
  BUSINESS_ID: TEST_BUSINESS_ID,
  GRANT_ID: TEST_GRANT_SLUG
}

export const ERROR_MESSAGES = {
  NETWORK_ERROR: ERROR_TEXT.NETWORK_ERROR,
  NO_CONTENT: ERROR_TEXT.NO_CONTENT,
  NOT_FOUND: HTTP_STATUS_TEXT.NOT_FOUND,
  INTERNAL_SERVER_ERROR: HTTP_STATUS_TEXT.INTERNAL_SERVER_ERROR,
  INVALID_URL: ERROR_TEXT.INVALID_URL
}

export const LOG_MESSAGES = {
  UNEXPECTED_STATE_FORMAT: 'Unexpected or empty state format',
  FETCH_FAILED: 'Failed to fetch saved state from API',
  PERSIST_FAILED: 'Failed to persist state to API'
}

export const MOCK_CONFIG_VALUES = {
  DEFAULT: {
    [CONFIG_KEYS.API_ENDPOINT]: TEST_BACKEND_URL,
    [CONFIG_KEYS.AUTH_TOKEN]: TEST_AUTH_TOKEN,
    [CONFIG_KEYS.ENCRYPTION_KEY]: TEST_ENCRYPTION_KEY,
    [CONFIG_KEYS.LOG]: TEST_LOG_CONFIG,
    [CONFIG_KEYS.GIT_REPOSITORY_NAME]: TEST_REPOSITORY_NAME,
    [CONFIG_KEYS.SERVICE_VERSION]: TEST_SERVICE_VERSION
  },
  WITHOUT_ENDPOINT: {
    [CONFIG_KEYS.API_ENDPOINT]: null,
    [CONFIG_KEYS.LOG]: TEST_LOG_CONFIG,
    [CONFIG_KEYS.GIT_REPOSITORY_NAME]: TEST_REPOSITORY_NAME,
    [CONFIG_KEYS.SERVICE_VERSION]: TEST_SERVICE_VERSION
  }
}

/**
 * Mock encrypted token for testing purposes (avoids expensive crypto operations)
 * @param {string} _token - The token to encrypt (unused in mock)
 * @param {string} encryptionKey - The encryption key to use
 * @returns {string} Mock encrypted token in expected format
 */
export function encryptTokenForTest(_token, encryptionKey) {
  if (!encryptionKey) {
    throw new Error(ERROR_TEXT.ENCRYPTION_NOT_CONFIGURED)
  }

  const mockIv = 'dGVzdGl2MTIzNA=='
  const mockAuthTag = 'dGVzdGF1dGh0YWc='
  const mockEncrypted = 'dGVzdGVuY3J5cHRlZA=='

  return `${mockIv}:${mockAuthTag}:${mockEncrypted}`
}

/**
 * Creates an expected Authorization header for testing
 * @param {string} token - The token to use
 * @param {string} encryptionKey - Optional encryption key for token encryption
 * @returns {string} Authorization header value
 */
export function createExpectedAuthHeader(token, encryptionKey = null) {
  let actualToken = token

  if (encryptionKey) {
    actualToken = encryptTokenForTest(token, encryptionKey)
  }

  const credentials = ':' + actualToken
  return `${AUTH_SCHEME} ${Buffer.from(credentials).toString(CRYPTO_ENCODING.BASE64)}`
}

/**
 * Creates a complete mock config for testing state helpers with backend configured
 * @returns {object} Mock config object with all required values
 */
export const createMockConfig = () => {
  return createCustomMockConfig()
}

/**
 * Creates a mock config for testing when backend endpoint is not configured
 * @returns {object} Mock config object with null endpoint
 */
export const createMockConfigWithoutEndpoint = () => {
  return createCustomMockConfig(MOCK_CONFIG_VALUES.WITHOUT_ENDPOINT)
}

/**
 * Creates a flexible mock config with custom values
 * @param {object} customValues - Custom config values to override defaults
 * @returns {object} Mock config object with custom values
 */
export const createCustomMockConfig = (customValues = {}) => {
  const configValues = { ...MOCK_CONFIG_VALUES.DEFAULT, ...customValues }
  const mockGet = vi.fn().mockImplementation((key) => configValues[key] || null)

  return { config: { get: mockGet } }
}
