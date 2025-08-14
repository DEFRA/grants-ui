import crypto from 'crypto'

export const MOCK_STATE_DATA = {
  DEFAULT: { state: { foo: 'bar' } },
  SIMPLE: { foo: 'bar' },
  WITH_STEP: { foo: 'bar', step: 1 }
}

export const HTTP_STATUS = {
  OK: 200,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
}

export const TEST_USER_IDS = {
  DEFAULT: 'user_test',
  BUSINESS_ID: 'biz_test',
  GRANT_ID: 'test-slug'
}

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error',
  NO_CONTENT: 'No content',
  NOT_FOUND: 'Not Found',
  INTERNAL_SERVER_ERROR: 'Internal Server Error',
  INVALID_URL: 'Invalid URL'
}

export const LOG_MESSAGES = {
  UNEXPECTED_STATE_FORMAT: 'Unexpected or empty state format',
  FETCH_FAILED: 'Failed to fetch saved state from API',
  PERSIST_FAILED: 'Failed to persist state to API'
}

/**
 * Encrypts a token for testing purposes using AES-256-GCM
 * @param {string} token - The token to encrypt
 * @param {string} encryptionKey - The encryption key to use
 * @returns {string} Encrypted token in format: iv:authTag:encryptedData (base64)
 */
export function encryptTokenForTest(token, encryptionKey) {
  if (!encryptionKey) {
    throw new Error('Encryption key not configured')
  }

  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(encryptionKey, 'salt', 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  let encrypted = cipher.update(token, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
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
  return `Basic ${Buffer.from(credentials).toString('base64')}`
}
