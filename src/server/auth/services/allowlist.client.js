import Jwt from '@hapi/jwt'
import { config } from '~/src/config/config.js'
import { createApiHeadersForGrantsUiBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'

const ALLOWLIST_ENDPOINT = '/allowlist/grants'
const SERVICE = 'grants-ui-backend'

/**
 * Fetches the list of grant codes the given user is permitted to access.
 * Returns an empty array when the user has no permitted grants (backend 200 + empty array).
 * Throws on non-2xx responses or network failures.
 *
 * @param {string} crn
 * @param {string} sbi
 * @returns {Promise<string[]>} Array of grant codes e.g. ['woodland', 'farm-payments']
 */
export async function fetchAllowedGrants(crn, sbi) {
  const baseUrl = config.get('session.cache.apiEndpoint')
  const jwtSecret = config.get('session.cache.jwtSecret')
  const url = `${baseUrl}${ALLOWLIST_ENDPOINT}`

  const encryptedAuth = Jwt.token.generate({ crn, sbi }, jwtSecret)

  const headers = /** @type {HeadersInit} */ ({
    ...createApiHeadersForGrantsUiBackend(),
    'x-encrypted-auth': encryptedAuth
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
      const body = await response.json()
      message = body?.message ?? message
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

  /** @type {{ grants?: Array<{ code: string }> }} */
  const body = await response.json()
  return (body.grants ?? []).map((g) => g.code)
}
