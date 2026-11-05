import Jwt from '@hapi/jwt'
import { config } from '~/src/config/config.js'
import { createApiHeadersForGrantsUiBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'
import { defineCachedMethod, UNRETRIED_GENERATE_TIMEOUT_MS } from '~/src/server/common/helpers/cache/cached-method.js'

const ALLOWLIST_ENDPOINT = '/allowlist/grants'
const SERVICE = 'grants-ui-backend'
const ALLOWLIST_CACHE_TTL_MS = 60 * 1000

/**
 * @param {string} crn
 * @param {string} sbi
 * @returns {Promise<AllowedGrant[]>}
 */
async function requestAllowedGrantDetails(crn, sbi) {
  const baseUrl = config.get('session.cache.apiEndpoint')
  const jwtSecret = config.get('session.cache.jwtSecret')
  const url = `${baseUrl}${ALLOWLIST_ENDPOINT}`

  const userContext = Jwt.token.generate({ crn, sbi }, jwtSecret)

  const headers = /** @type {HeadersInit} */ ({
    ...(await createApiHeadersForGrantsUiBackend()),
    'x-user-context': userContext
  })

  const response = await fetch(url, { method: 'GET', headers }).catch((error) => {
    logUpstreamError({
      endpoint: ALLOWLIST_ENDPOINT,
      service: SERVICE,
      upstreamStatus: null,
      errorMessage: error.message
    })
    throw error
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const errorBody = await response.json()
      message = errorBody?.message ?? message
    } catch {
      // no json body
    }
    logUpstreamError({
      endpoint: ALLOWLIST_ENDPOINT,
      service: SERVICE,
      upstreamStatus: response.status,
      errorMessage: message
    })
    const error = /** @type {Error & { status?: number }} */ (new Error(message))
    error.status = response.status
    throw error
  }

  /** @type {{ grants?: AllowedGrant[] }} */
  const body = await response.json()
  return body.grants ?? []
}

const allowedGrantDetails = defineCachedMethod('allowlist.grantDetails', requestAllowedGrantDetails, {
  expiresIn: ALLOWLIST_CACHE_TTL_MS,
  generateTimeout: UNRETRIED_GENERATE_TIMEOUT_MS,
  generateKey: (crn, sbi) => `${crn}:${sbi}`
})

export const allowlistCachePlugin = {
  plugin: {
    name: 'allowlist-cache',
    register(/** @type {Server} */ server) {
      allowedGrantDetails.register(server)
    }
  }
}

/**
 * @param {string} crn
 * @param {string} sbi
 * @returns {Promise<AllowedGrant[]>}
 */
export function fetchAllowedGrantDetails(crn, sbi) {
  return allowedGrantDetails.call(crn, sbi)
}

/**
 * Fetches only the grant codes used by journey-level allowlist enforcement.
 *
 * @param {string} crn
 * @param {string} sbi
 * @returns {Promise<string[]>}
 */
export async function fetchAllowedGrants(crn, sbi) {
  const grants = await fetchAllowedGrantDetails(crn, sbi)
  return grants.map(({ code }) => code)
}

/**
 * @typedef {Object} AllowedGrant
 * @property {string} code
 * @property {string} title
 * @property {string|null} description
 * @property {string|null} url
 */

/**
 * @import { Server } from '@hapi/hapi'
 */
