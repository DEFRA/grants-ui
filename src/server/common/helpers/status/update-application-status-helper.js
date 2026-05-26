import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { parseSessionKey } from '../state/get-cache-key-helper.js'
import { createApiHeadersForGrantsUiBackend } from '../auth/backend-auth-helper.js'
import { debug, log, LogCodes } from '../logging/log.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

/**
 * Sends a PATCH to the Grants UI backend to update the stored application status.
 *
 * @param {string} applicationStatus - The new application status to persist.
 * @param {string} key - The session key in `sbi:grantCode` form.
 * @param {{ lockToken?: string, grantVersion?: string }} [options] - Optional lock token and grant version.
 * @returns {Promise<void>} Resolves once the update request completes.
 */
export async function updateApplicationStatus(
  applicationStatus,
  key,
  { lockToken, grantVersion = '1.0.0' } = /** @type {{ lockToken?: string, grantVersion?: string }} */ ({})
) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return
  }

  const { sbi, grantCode } = parseSessionKey(key)

  const url = new URL(`/state/${sbi}/${grantCode}/${grantVersion}`, GRANTS_UI_BACKEND_ENDPOINT)

  log(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG, {
    method: 'PATCH',
    endpoint: url.href,
    identity: key,
    summary: {
      applicationStatus
    }
  })

  try {
    const response = await fetch(url.href, {
      method: 'PATCH',
      headers: createApiHeadersForGrantsUiBackend({ lockToken }),
      body: JSON.stringify({
        state: {
          applicationStatus
        }
      })
    })

    if (!response.ok) {
      log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
        method: 'PATCH',
        endpoint: url.href,
        identity: key,
        errorMessage: `${response.status} - ${response.statusText}`
      })
    }
  } catch (err) {
    debug(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      method: 'PATCH',
      endpoint: url.href,
      identity: key,
      errorMessage: /** @type {Error} */ (err).message
    })
    // NOSONAR TODO: See TGC-873
    // throw err
  }
}
