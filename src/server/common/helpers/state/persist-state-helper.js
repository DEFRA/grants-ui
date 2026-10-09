import 'dotenv/config'
import { SessionError } from '../../utils/errors/SessionError.js'
import { statusCodes } from '../../constants/status-codes.js'
import { config } from '~/src/config/config.js'
import { parseSessionKey } from './get-cache-key-helper.js'
import { createApiHeadersForGrantsUiBackend } from '../auth/backend-auth-helper.js'
import { debug, log, LogCodes } from '../logging/log.js'

// @ts-ignore - TS2589: Type instantiation excessively deep (convict type complexity)
const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')
// @ts-ignore - TS2589: Type instantiation excessively deep (convict type complexity)
const MAX_DB_STATE_SIZE_BYTES = config.get('session.cache.maxDbStateSizeBytes')

/**
 * Persists a given state object to the Grants UI backend API.
 *
 * @param {Record<string, unknown>} state - The state object to persist. Can include form/session data.
 * @param {string} key - The cache/session key to identify this state.
 * @param {{grantVersion?: unknown, lockToken?: string, failOnError?: boolean}} [options] - Optional grant version, lock token to identify who is locking the state.
 * @returns {Promise<void>} Resolves once the state is sent to the backend.
 */
export async function persistStateToApi(state, key, { lockToken, grantVersion, failOnError = false } = {}) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    if (failOnError) {
      throw new SessionError({
        message: 'Unable to save the application',
        source: 'persistStateToApi',
        reason: 'Backend endpoint is not configured',
        status: statusCodes.serviceUnavailable
      })
    }
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

  const body = JSON.stringify({
    sbi,
    grantCode,
    grantVersion,
    state
  })

  const bodySize = Buffer.byteLength(body)
  if (bodySize > MAX_DB_STATE_SIZE_BYTES) {
    log(LogCodes.SYSTEM.STATE_SIZE_EXCEEDED, {
      size: bodySize,
      limit: MAX_DB_STATE_SIZE_BYTES,
      sessionKey: key
    })
    throw new Error(`State payload size (${bodySize} bytes) exceeds limit (${MAX_DB_STATE_SIZE_BYTES} bytes)`)
  }

  try {
    const response = await fetch(url.href, {
      method: 'POST',
      headers: await createApiHeadersForGrantsUiBackend({ lockToken }),
      body
    })

    if (!response.ok) {
      if (failOnError) {
        throw new SessionError({
          message: 'Unable to save the application',
          source: 'persistStateToApi',
          reason: `Backend returned HTTP ${response.status}`,
          status: statusCodes.badGateway
        })
      }
      log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
        method: 'POST',
        endpoint: url.href,
        identity: key,
        errorMessage: `${response.status} - ${response.statusText}`
      })
    }
  } catch (err) {
    if (failOnError) {
      if (err instanceof SessionError) {
        throw err
      }
      throw new SessionError({
        message: 'Unable to save the application',
        source: 'persistStateToApi',
        reason: 'Backend request failed',
        status: statusCodes.badGateway
      }).from(/** @type {Error} */ (err))
    }
    debug(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      method: 'POST',
      endpoint: url.href,
      identity: key,
      errorMessage: /** @type {Error} */ (err).message
    })
    // NOSONAR TODO: See TGC-873
    // throw err
  }
}
