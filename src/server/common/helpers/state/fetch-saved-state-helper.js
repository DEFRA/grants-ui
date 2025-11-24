import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { parseSessionKey } from './get-cache-key-helper.js'
import { createApiHeadersForGrantsUiBackend } from './backend-auth-helper.js'
import { log, LogCodes } from '../logging/log.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

/**
 * Logging function for API errors
 * @param logCode
 * @returns {(function(*, {}=): void)|*}
 */
function logApiError(logCode = LogCodes.SYSTEM.EXTERNAL_API_ERROR) {
  /**
   * Logs API errors with the specified log code
   * @param {Object} request - The request object
   * @param {Object} messageOptions - Additional message options
   */
  return (request, messageOptions = {}) => log(logCode, messageOptions, request)
}

/**
 * Constructs the endpoint URL for the state API based on the session key
 * @param key
 * @returns {string}
 */
function getEndpoint(key) {
  const { sbi, grantCode } = parseSessionKey(key)
  const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)
  url.searchParams.set('sbi', sbi)
  url.searchParams.set('grantCode', grantCode)
  return url.href
}

/**
 * Makes an API call to the state endpoint with the specified HTTP method
 * @param {string} key - The session key
 * @param {string} method - HTTP method (GET or DELETE)
 * @param {Request} request - The request object
 * @returns {Promise<Object|null>} The response JSON or null
 */
async function callStateApi(key, method, request) {
  const logDebug = logApiError(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG)
  const logError = logApiError()

  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return null
  }

  let response
  const endpoint = getEndpoint(key)

  logDebug(request, {
    method,
    endpoint,
    identity: key
  })

  try {
    response = await fetch(endpoint, {
      method,
      headers: createApiHeadersForGrantsUiBackend()
    })
  } catch (err) {
    logError(request, { method, endpoint, identity: key, errorMessage: err.message })
    throw err
  }

  if (!response.ok) {
    if (response.status === statusCodes.notFound) {
      logDebug(request, { method, endpoint, identity: key, summary: 'No state found in backend' })
      return null
    }

    const errorMessage = `Failed to ${method === 'DELETE' ? 'clear' : 'fetch'} saved state: ${response.status}`
    logError(request, { method, endpoint, identity: key, error: errorMessage })
    throw new Error(errorMessage)
  }

  const json = await response.json()

  if (!json || typeof json !== 'object') {
    const errorMessage = `Unexpected or empty state format: ${json}`
    logError(request, { method, endpoint, identity: key, error: errorMessage })
    throw new Error(errorMessage)
  }

  return json
}

export async function fetchSavedStateFromApi(key, request) {
  return callStateApi(key, 'GET', request)
}

export async function clearSavedStateFromApi(key, request) {
  return callStateApi(key, 'DELETE', request)
}
