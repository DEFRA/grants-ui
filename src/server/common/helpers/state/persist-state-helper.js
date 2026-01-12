import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { parseSessionKey } from './get-cache-key-helper.js'
import { createApiHeadersForGrantsUiBackend } from './backend-auth-helper.js'
import { log, LogCodes } from '../logging/log.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

/**
 * Persists a given state object to the Grants UI backend API.
 *
 * @param {object} state - The state object to persist. Can include form/session data.
 * @param {string} key - The cache/session key to identify this state.
 * @param {{lockToken?: string}} [options] - Optional lock token to identify who is locking the state.
 * @returns {Promise<void>} Resolves once the state is sent to the backend.
 */
export async function persistStateToApi(state, key, { lockToken } = {}) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return
  }

  const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)

  const { sbi, grantCode } = parseSessionKey(key)

  log(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG, {
    method: 'POST',
    endpoint: url.href,
    identity: key,
    summary: {
      hasReference: Boolean(state?.$$__referenceNumber),
      keyCount: Object.keys(state || {}).length
    }
  })

  try {
    const response = await fetch(url.href, {
      method: 'POST',
      headers: createApiHeadersForGrantsUiBackend({ lockToken }),
      body: JSON.stringify({
        sbi,
        grantCode,
        grantVersion: 1, // NOSONAR TODO: Update when support for same grant versioning is implemented
        state
      })
    })

    if (!response.ok) {
      log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
        method: 'POST',
        endpoint: url.href,
        identity: key,
        errorMessage: `${response.status} - ${response.statusText}`
      })
    }
  } catch (err) {
    log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      method: 'POST',
      endpoint: url.href,
      identity: key,
      errorMessage: err.message
    })
    // NOSONAR TODO: See TGC-873
    // throw err
  }
}
