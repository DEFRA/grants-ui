import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { parseSessionKey } from './get-cache-key-helper.js'
import { createApiHeadersForGrantsUiBackend } from '../auth/backend-auth-helper.js'
import { log, LogCodes } from '../logging/log.js'
import { createBoomError } from '../errors.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

/**
 * Logging function for API errors
 * @param {LogCodeEntry} [logCode] - The log code entry to bind the returned logger to
 * @returns {(request: AnyRequest, messageOptions?: Record<string, unknown>) => void} A logger bound to the given log code
 */
function logApiError(logCode = LogCodes.SYSTEM.EXTERNAL_API_ERROR) {
  /**
   * Logs API errors with the specified log code
   * @param {AnyRequest} request - The request object
   * @param {Record<string, unknown>} messageOptions - Additional message options
   */
  return (request, messageOptions = {}) => log(logCode, messageOptions, request)
}

/**
 * Constructs the endpoint URL for the state API based on the session key
 * @param {string} key - The session key
 * @param {string | number} grantVersion - The grant definition version
 * @returns {string}
 */
function getEndpoint(key, grantVersion) {
  const { sbi, grantCode } = parseSessionKey(key)
  const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)
  url.searchParams.set('sbi', sbi)
  url.searchParams.set('grantCode', grantCode)
  url.searchParams.set('grantVersion', /** @type {string} */ (grantVersion))
  return url.href
}

/**
 * Makes an API call to the state endpoint with the specified HTTP method
 * @param {string} key - The session key
 * @param {string} method - HTTP method (GET or DELETE)
 * @param {AnyRequest} request - The request object
 * @param {{lockToken?: string, grantVersion?: string | number}} [options]
 * @returns {Promise<Record<string, unknown>|null>} The response JSON or null
 */
async function callStateApi(key, method, request, { lockToken, grantVersion } = {}) {
  const logDebug = logApiError(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG)
  const logError = logApiError()
  // Prefer an explicitly resolved version (e.g. the backend-resolved active
  // version used to clear state); fall back to the authored model version, then
  // 1 to support non-config broker grants.
  const resolvedVersion = /** @type {string | number} */ (
    grantVersion ?? request.app.model?.def?.metadata?.version ?? 1
  )
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return null
  }

  let response
  const endpoint = getEndpoint(key, resolvedVersion)

  logDebug(request, {
    method,
    endpoint,
    identity: key
  })

  try {
    response = await fetch(endpoint, {
      method,
      headers: createApiHeadersForGrantsUiBackend({ lockToken })
    })
  } catch (err) {
    logError(request, { method, endpoint, identity: key, errorMessage: /** @type {Error} */ (err).message })
    throw err
  }

  if (!response.ok) {
    if (response.status === statusCodes.notFound) {
      logDebug(request, { method, endpoint, identity: key, summary: 'No state found in backend' })
      return null
    }

    const errorMessage = `Failed to ${method === 'DELETE' ? 'clear' : 'fetch'} saved state: ${response.status}`
    logError(request, { method, endpoint, identity: key, error: errorMessage })
    throw createBoomError(response.status, errorMessage)
  }

  const json = await response.json()

  if (!json || typeof json !== 'object') {
    const errorMessage = `Unexpected or empty state format: ${json}`
    logError(request, { method, endpoint, identity: key, error: errorMessage })
    throw new Error(errorMessage)
  }

  return json
}

/**
 * Fetches the combined form-definition + saved-state envelope from the backend
 * via `POST /state/with-definition`.
 *
 * The backend resolves the active grant version itself, so this read does not
 * need a `grantVersion` (the lock token is minted without one). For legacy
 * YAML-sourced forms pass `includeDefinition: false` so the backend skips
 * definition resolution and returns state + version only.
 *
 * @param {string} key - The session key (`sbi:grantCode`)
 * @param {AnyRequest} request - The request object
 * @param {{lockToken?: string, includeDefinition?: boolean}} [options]
 * @returns {Promise<StateWithDefinitionEnvelope | null>} The envelope, or `null` on 404 / unconfigured backend
 */
export async function fetchStateWithDefinitionFromApi(key, request, { lockToken, includeDefinition = true } = {}) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return null
  }

  const logDebug = logApiError(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG)
  const logError = logApiError()
  const { sbi, grantCode } = parseSessionKey(key)
  const method = 'POST'
  const endpoint = new URL('/state/with-definition', GRANTS_UI_BACKEND_ENDPOINT).href

  logDebug(request, { method, endpoint, identity: key, summary: { includeDefinition } })

  let response
  try {
    response = await fetch(endpoint, {
      method,
      headers: createApiHeadersForGrantsUiBackend({ lockToken }),
      body: JSON.stringify({ sbi, grantCode, includeDefinition })
    })
  } catch (err) {
    logError(request, { method, endpoint, identity: key, errorMessage: /** @type {Error} */ (err).message })
    throw err
  }

  if (!response.ok) {
    if (response.status === statusCodes.notFound) {
      logDebug(request, { method, endpoint, identity: key, summary: 'No form definition found' })
      return null
    }

    const errorMessage = `Failed to fetch state with definition: ${response.status}`
    logError(request, { method, endpoint, identity: key, error: errorMessage })
    throw createBoomError(response.status, errorMessage)
  }

  const json = await response.json()

  if (!json || typeof json !== 'object') {
    const errorMessage = `Unexpected or empty state-with-definition format: ${json}`
    logError(request, { method, endpoint, identity: key, error: errorMessage })
    throw new Error(errorMessage)
  }

  return /** @type {StateWithDefinitionEnvelope} */ (json)
}

/**
 * @param {string} key
 * @param {AnyRequest} request
 * @param {{lockToken?: string, grantVersion?: string | number}} [options]
 */
export async function clearSavedStateFromApi(key, request, { lockToken, grantVersion } = {}) {
  return callStateApi(key, 'DELETE', request, { lockToken, grantVersion })
}

/**
 * Deletes the state document for a specific grant by sbi, grantCode and grantVersion.
 * Used when the request has no form model (e.g. clearing state from the agreements proxy page).
 *
 * @param {{ sbi: string, grantCode: string, grantVersion: string | number, lockToken: string }} params
 * @returns {Promise<void>}
 */
export async function clearSavedStateFromApiByContext({ sbi, grantCode, grantVersion, lockToken }) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return
  }

  const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)
  url.searchParams.set('sbi', sbi)
  url.searchParams.set('grantCode', grantCode)
  url.searchParams.set('grantVersion', String(grantVersion))

  const response = await fetch(url.href, {
    method: 'DELETE',
    headers: createApiHeadersForGrantsUiBackend({ lockToken })
  })

  if (!response.ok && response.status !== statusCodes.notFound) {
    throw createBoomError(response.status, `Failed to clear state: ${response.status}`)
  }
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { LogCodeEntry } from '../logging/log.js'
 * @import { FormDefinition } from '@defra/forms-model'
 */

/**
 * The saved-state document as persisted in grants-ui-backend (Mongo).
 *
 * This is the *full* document, not the bare form state: the actual form
 * submission state lives under the nested `state` property, while the
 * surrounding fields (`sbi`, `grantCode`, `grantVersion`, …) are document
 * metadata. Read the nested `state` when you need the answers the user has
 * entered; read the top-level fields when you need document context.
 *
 * @typedef {object} StateDocument
 * @property {string} [sbi]
 * @property {string} [grantCode]
 * @property {string} [grantVersion] - The grant version this state belongs to
 * @property {Record<string, unknown>} [state] - The actual saved form state
 */

/**
 * The form-definition document as stored in grants-ui-backend (Mongo).
 *
 * This is the *full* document, not the bare DXT definition: the actual form
 * definition lives under the nested `definition` property, while
 * `major`/`minor`/`patch` carry the document's semantic version. Read the
 * nested `definition` when you need the DXT form definition; read the
 * top-level fields when you need the version.
 *
 * @typedef {object} DefinitionDocument
 * @property {string} [grantCode]
 * @property {number} [major]
 * @property {number} [minor]
 * @property {number} [patch]
 * @property {'active' | 'draft'} [status] - The publication status of this version
 * @property {string} [updatedAt] - When this version was last updated (changes on publish)
 * @property {FormDefinition} [definition] - The actual form definition
 */

/**
 * The combined response returned by `POST /state/with-definition`.
 *
 * Both `state` and `definition` are the *full* backend documents — the nested
 * form state is at `state.state` and the nested form definition is at
 * `definition.definition`. The surrounding document fields (version, ids) are
 * intentionally preserved for callers that need the extra context.
 *
 * @typedef {object} StateWithDefinitionEnvelope
 * @property {DefinitionDocument} [definition] - The form-definition document (omitted when `includeDefinition: false`)
 * @property {StateDocument | null} state - The saved-state document, or `null` when none exists
 * @property {boolean} upgraded - Whether the backend upgraded the state to a newer grant version
 * @property {string} [fromVersion] - The version the state was upgraded from (when `upgraded`)
 * @property {string} [toVersion] - The version the state was upgraded to (when `upgraded`)
 */
