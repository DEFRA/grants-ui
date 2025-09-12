import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { parseSessionKey } from './get-cache-key-helper.js'
import { createApiHeaders } from './backend-auth-helper.js'
import { log, LogCodes } from '../logging/log.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

export async function fetchSavedStateFromApi(key) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return null
  }

  const { userId, organisationId, grantId } = parseSessionKey(key)

  let json = null
  const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)
  try {
    log(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG, {
      method: 'GET',
      endpoint: url.href,
      identity: key
    })

    url.searchParams.set('userId', userId)
    url.searchParams.set('businessId', organisationId)
    url.searchParams.set('grantId', grantId)

    const response = await fetch(url.href, {
      method: 'GET',
      headers: createApiHeaders()
    })

    if (!response.ok) {
      if (response.status === statusCodes.notFound) {
        log(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG, {
          method: 'GET',
          endpoint: url.href,
          identity: key,
          stateSummary: 'No state found in backend'
        })
        return null
      }
      throw new Error(`Failed to fetch saved state: ${response.status}`)
    }

    json = await response.json()

    if (!json || typeof json !== 'object') {
      log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
        method: 'GET',
        endpoint: url.href,
        identity: key,
        error: `Unexpected or empty state format: ${json}`
      })
      return null
    }
  } catch (err) {
    log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      method: 'GET',
      endpoint: url.href,
      identity: key,
      error: err.message
    })
    return null
  }

  return json
}
