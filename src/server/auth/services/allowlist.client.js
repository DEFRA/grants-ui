import Jwt from '@hapi/jwt'
import { config } from '~/src/config/config.js'
import { createApiHeadersForGrantsUiBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'

const ALLOWLIST_ENDPOINT = '/allowlist/grants'
const SERVICE = 'grants-ui-backend'

/**
 * Fetches the grants the given user is permitted to access.
 * Returns an empty array when the user has no permitted grants (backend 200 + empty array).
 * Throws on non-2xx responses or network failures.
 *
 * @param {string} crn
 * @param {string} sbi
 * @returns {Promise<AllowedGrant[]>}
 */
export async function fetchAllowedGrantDetails(crn, sbi) {
  const baseUrl = config.get('session.cache.apiEndpoint')
  const jwtSecret = config.get('session.cache.jwtSecret')
  const url = `${baseUrl}${ALLOWLIST_ENDPOINT}`

  const userContext = Jwt.token.generate({ crn, sbi }, jwtSecret)

  const headers = /** @type {HeadersInit} */ ({
    ...createApiHeadersForGrantsUiBackend(),
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
