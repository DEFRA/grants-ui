import { createApiHeadersForGrantsUiBackend } from '../auth/backend-auth-helper.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { mintLockReleaseToken } from './lock-token.js'
import { config } from '~/src/config/config.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

/**
 * Releases all application locks held by a given user via the grants-ui-backend API.
 *
 * This function calls the backend DELETE `/application-locks` endpoint using a lock-release token.
 * It handles cases where the endpoint is not configured, network errors, non-OK HTTP responses,
 * and invalid JSON returned by the backend.
 *
 * @param {Object} params - Parameters object.
 * @param {string} params.ownerId - DEFRA user ID of the owner whose locks should be released.
 *
 * @returns {Promise<{ok: boolean, releasedCount: number, skipped?: boolean}>}
 *   Result object indicating whether locks were released, how many, and if the call was skipped
 * @example
 * const result = await releaseAllApplicationLocksForOwnerFromApi({ ownerId: 'user-123' })
 * // result -> { ok: true, releasedCount: 3 }
 */
export async function releaseAllApplicationLocksForOwnerFromApi({ ownerId }) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    log(LogCodes.APPLICATION_LOCKS.RELEASE_SKIPPED, {
      ownerId,
      reason: 'Endpoint not configured'
    })
    return { ok: true, releasedCount: 0, skipped: true }
  }

  const url = new URL('/application-locks', GRANTS_UI_BACKEND_ENDPOINT)

  log(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG, {
    method: 'DELETE',
    endpoint: url.href,
    identity: ownerId,
    summary: { action: 'releaseAllLocksForOwner' }
  })

  const token = mintLockReleaseToken({
    ownerId
  })

  try {
    const response = await fetch(url.href, {
      method: 'DELETE',
      headers: {
        ...createApiHeadersForGrantsUiBackend(),
        'x-application-lock-release': String(token)
      }
    })

    if (!response.ok) {
      log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
        method: 'DELETE',
        endpoint: url.href,
        identity: ownerId,
        errorMessage: `${response.status} - ${response.statusText}`
      })
      return { ok: false, releasedCount: 0 }
    }

    const body = await response.json().catch(() => ({}))
    log(LogCodes.APPLICATION_LOCKS.RELEASE_SUCCEEDED, {
      ownerId,
      releasedCount: body.releasedCount ?? 0
    })
    return { ok: true, releasedCount: body.releasedCount ?? 0 }
  } catch (err) {
    log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      method: 'DELETE',
      endpoint: url.href,
      identity: ownerId,
      errorMessage: err.message
    })
    return { ok: false, releasedCount: 0 }
  }
}
