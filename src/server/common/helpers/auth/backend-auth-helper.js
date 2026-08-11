import { config } from '~/src/config/config.js'
import { withTraceId } from '@defra/hapi-tracing'
import { encryptToken } from './encrypt-token.js'

export { encryptToken }

/** @type {Record<string, BufferEncoding>} */
const ENCODING = {
  UTF8: 'utf8',
  BASE64: 'base64'
}

const CONTENT_TYPE_JSON = 'application/json'
const AUTH_SCHEME = 'Bearer'
const GRANTS_UI_BACKEND_AUTH_TOKEN = config.get('session.cache.authToken')
const ENCRYPTION_KEY = config.get('session.cache.encryptionKey')
const LAND_GRANTS_AUTH_TOKEN = config.get('landGrants.authToken')
const LAND_GRANTS_ENCRYPTION_KEY = config.get('landGrants.encryptionKey')
/**
 * Creates headers for authenticating with the grants-ui-backend API
 * @param {string} token - Auth token
 * @param {string} encryptionKey - Encryption key
 * @param {Record<string, string>} [baseHeaders] - Base headers to extend
 * @returns {Record<string, string>} Headers with authentication if token is available
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
 * @param {{ lockToken?: string }} [options]
 * @returns {Record<string, string>} Headers with Content-Type and authentication
 */
export function createApiHeadersForGrantsUiBackend({ lockToken } = {}) {
  const headers = createAuthenticatedHeaders(GRANTS_UI_BACKEND_AUTH_TOKEN, ENCRYPTION_KEY, {
    'Content-Type': CONTENT_TYPE_JSON
  })

  if (lockToken) {
    headers['X-Application-Lock-Owner'] = lockToken
  }
  return headers
}

/**
 * Creates standard headers for API requests to land-grants-api
 * @returns {Record<string, string>} Headers with Content-Type and authentication
 */
export function createApiHeadersForLandGrantsBackend() {
  return withTraceId(
    config.get('tracing.header'),
    createAuthenticatedHeaders(LAND_GRANTS_AUTH_TOKEN, LAND_GRANTS_ENCRYPTION_KEY, {
      'Content-Type': CONTENT_TYPE_JSON
    })
  )
}
