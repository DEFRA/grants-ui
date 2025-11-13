import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { parseSessionKey } from './get-cache-key-helper.js'
import { createApiHeadersForGrantsUiBackend } from './backend-auth-helper.js'
import { log, LogCodes } from '../logging/log.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

/**
 * Makes an API call to the state endpoint with the specified HTTP method
 * @param {string} key - The session key
 * @param {string} method - HTTP method (GET or DELETE)
 * @param {Request} request - The request object
 * @returns {Promise<Object|null>} The response JSON or null
 */
async function callStateApi(key, method, request) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return null
  }

  const { sbi, grantCode } = parseSessionKey(key)
  const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)
  url.searchParams.set('sbi', sbi)
  url.searchParams.set('grantCode', grantCode)

  try {
    log(
      LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
      {
        method,
        endpoint: url.href,
        identity: key
      },
      request
    )

    const response = await fetch(url.href, {
      method,
      headers: createApiHeadersForGrantsUiBackend()
    })

    if (!response.ok) {
      if (response.status === statusCodes.notFound) {
        log(
          LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
          {
            method,
            endpoint: url.href,
            identity: key,
            summary: 'No state found in backend'
          },
          request
        )
        return null
      }
      throw new Error(`Failed to ${method === 'DELETE' ? 'clear' : 'fetch'} saved state: ${response.status}`)
    }

    const json = await response.json()

    if (!json || typeof json !== 'object') {
      log(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        {
          method,
          endpoint: url.href,
          identity: key,
          error: `Unexpected or empty state format: ${json}`
        },
        request
      )
      return null
    }

    return json
  } catch (err) {
    log(
      LogCodes.SYSTEM.EXTERNAL_API_ERROR,
      {
        method,
        endpoint: url.href,
        identity: key,
        error: err.message
      },
      request
    )
    return null
  }
}

export async function fetchSavedStateFromApi(key, request) {
  return callStateApi(key, 'GET', request)
}

export async function clearSavedStateFromApi(key, request) {
  return callStateApi(key, 'DELETE', request)
}
