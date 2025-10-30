import { config } from '~/src/config/config.js'
import crypto from 'node:crypto'

const IV_LENGTH_BYTES = 12
const KEY_LENGTH_BYTES = 32
const SCRYPT_SALT = 'salt'
const CIPHER_ALGORITHM = 'aes-256-gcm'
/** @type {Record<string, BufferEncoding>} */
const ENCODING = {
  UTF8: 'utf8',
  BASE64: 'base64'
}

const CONTENT_TYPE_JSON = 'application/json'
const AUTH_SCHEME = 'Bearer'

const GRANTS_UI_BACKEND_AUTH_TOKEN = config.get('session.cache.authToken')

/**
 * Encrypts the bearer token using AES-256-GCM
 * @param {string} token - The token to encrypt
 * @param {string} encryptionKey - Encryption key
 * @returns {string} Encrypted token in format: iv:authTag:encryptedData (base64)
 */
export function encryptToken(token, encryptionKey) {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES)
  const key = crypto.scryptSync(encryptionKey, SCRYPT_SALT, KEY_LENGTH_BYTES)
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv)

  let encrypted = cipher.update(token, ENCODING.UTF8, ENCODING.BASE64)
  encrypted += cipher.final(ENCODING.BASE64)

  const authTag = cipher.getAuthTag()

  return `${iv.toString(ENCODING.BASE64)}:${authTag.toString(ENCODING.BASE64)}:${encrypted}`
}

/**
 * Creates headers for authenticating with the grants-ui-backend API
 * @param {string} token - Auth token
 * @param {string} encryptionKey - Encryption key
 * @param {object} baseHeaders - Base headers to extend
 * @returns {object} Headers with authentication if token is available
 */
export function createAuthenticatedHeaders(token, encryptionKey, baseHeaders = {}) {
  const headers = { ...baseHeaders }

  if (token) {
    const encryptedToken = encryptToken(token, encryptionKey)
    const authCredentials = Buffer.from(encryptedToken).toString(ENCODING.BASE64)
    headers.Authorization = `${AUTH_SCHEME} ${authCredentials}`
  }

  return headers
}

/**
 * Creates standard headers for API requests to grants-ui-backend
 * @returns {object} Headers with Content-Type and authentication
 */
export function createApiHeadersForGrantsUiBackend() {
  const ENCRYPTION_KEY = config.get('session.cache.encryptionKey')
  return createAuthenticatedHeaders(GRANTS_UI_BACKEND_AUTH_TOKEN, ENCRYPTION_KEY, {
    'Content-Type': CONTENT_TYPE_JSON
  })
}
