import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { parseSessionKey } from './get-cache-key-helper.js'
import { createApiHeaders } from './backend-auth-helper.js'
import { log, LogCodes } from '../logging/log.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

export async function updateApplicationStatus(applicationStatus, key) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return
  }

  const { sbi, grantCode } = parseSessionKey(key)

  const url = new URL(`/state/${sbi}/${grantCode}`, GRANTS_UI_BACKEND_ENDPOINT)

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
      headers: createApiHeaders(),
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
        error: `${response.status} - ${response.statusText}`
      })
    }
  } catch (err) {
    log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      method: 'PATCH',
      endpoint: url.href,
      identity: key,
      error: err.message
    })
    // TODO: See TGC-781
    // throw err
  }
}
