import { config } from '~/src/config/config.js'
import crypto from 'crypto'

const GRANTS_UI_BACKEND_AUTH_TOKEN = config.get('session.cache.authToken')
const ENCRYPTION_KEY = config.get('session.cache.encryptionKey')

/**
 * Encrypts the bearer token using AES-256-GCM
 * @param {string} token - The token to encrypt
 * @returns {string} Encrypted token in format: iv:authTag:encryptedData (base64)
 */
export function encryptToken(token) {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured')
  }

  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  let encrypted = cipher.update(token, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

/**
 * Creates headers for authenticating with the grants-ui-backend API
 * @param {object} baseHeaders - Base headers to extend
 * @returns {object} Headers with authentication if token is available
 */
export function createAuthenticatedHeaders(baseHeaders = {}) {
  const headers = { ...baseHeaders }

  if (GRANTS_UI_BACKEND_AUTH_TOKEN) {
    if (!ENCRYPTION_KEY) {
      throw new Error('Encryption key is required for secure token transmission')
    }
    const encryptedToken = encryptToken(GRANTS_UI_BACKEND_AUTH_TOKEN)
    const authCredentials = Buffer.from(`:${encryptedToken}`).toString('base64')
    headers.Authorization = `Basic ${authCredentials}`
  }

  return headers
}

/**
 * Creates standard headers for API requests to grants-ui-backend
 * @returns {object} Headers with Content-Type and authentication
 */
export function createApiHeaders() {
  return createAuthenticatedHeaders({
    'Content-Type': 'application/json'
  })
}
