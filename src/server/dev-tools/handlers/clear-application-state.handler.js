import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'
import { SessionError } from '~/src/server/common/utils/errors/SessionError.js'
import { findFormBySlug, loadFormDefinition } from '~/src/server/common/forms/services/find-form-by-slug.js'
import { clearParcelCache } from '~/src/server/land-grants/services/parcel-cache.js'
import { clearSavedStateFromApiByContext } from '~/src/server/common/helpers/state/fetch-saved-state-helper.js'
import { mintLockToken } from '~/src/server/common/helpers/lock/lock-token.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

/**
 * @typedef {import('@hapi/hapi').Request & {
 *   app: { model?: { def?: object } },
 *   server: import('@hapi/hapi').Request['server'] & { methods: { getFormService?: () => any } }
 * }} ClearStateRequest
 */

/**
 * Clears the current application state
 * @param {ClearStateRequest} request - Hapi request object
 * @param {import('@hapi/hapi').ResponseToolkit} h - Hapi response toolkit
 * @returns {Promise<import('@hapi/hapi').ResponseObject>} Hapi response
 */
export async function clearApplicationStateHandler(request, h) {
  const slug = request.params?.slug || ''

  if (slug) {
    await clearStateWithSlug(slug, request)
  } else {
    await clearStateWithoutSlug(request)
  }

  clearParcelCache()

  return h.redirect(`/${slug}`)
}

/**
 * @param {string} slug
 * @param {ClearStateRequest} request
 */
async function clearStateWithSlug(slug, request) {
  if (!request.app.model) {
    const form = await findFormBySlug(slug)
    if (form) {
      await loadFormAndSetOnRequestModel(form, request)
    }
  }

  const cacheService = getFormsCacheService(request.server)
  let clearError
  try {
    await cacheService.clearState(request, true)
  } catch (error) {
    const sessionKey = cacheService._Key(request)
    clearError = new SessionError({
      message: 'Session state clear failed',
      source: 'clearApplicationStateHandler',
      reason: 'session_state_clear_failure',
      slug,
      sessionKey
    }).from(/** @type {Error} */ (error))
  }

  if (clearError) {
    log(LogCodes.SYSTEM.SERVER_ERROR, { errorMessage: clearError.message }, request)
  }
}

/**
 * @param {ClearStateRequest} request
 */
async function clearStateWithoutSlug(request) {
  const credentials = /** @type {{ sbi?: string, contactId?: string }} */ (request.auth?.credentials)
  const sbi = credentials?.sbi
  const contactId = credentials?.contactId
  const app = /** @type {{ grantCode?: string | null, grantVersion?: string | number | null }} */ (request.app)
  const grantCode = app.grantCode
  const grantVersion = app.grantVersion ?? 1

  if (!sbi || !grantCode || !contactId) {
    return
  }

  const lockToken = mintLockToken({ userId: String(contactId), sbi, grantCode, grantVersion })

  let clearError
  try {
    await clearSavedStateFromApiByContext({ sbi, grantCode, grantVersion, lockToken })
  } catch (err) {
    clearError = new SessionError({
      message: 'Session state clear failed',
      source: 'clearStateWithoutSlug',
      reason: 'session_state_clear_failure',
      sbi,
      grantCode
    }).from(/** @type {Error} */ (err))
  }

  if (clearError) {
    log(LogCodes.SYSTEM.SERVER_ERROR, { errorMessage: clearError.message }, request)
  }
}

const loadFormAndSetOnRequestModel = async (form, request) => {
  const definition = await loadFormDefinition(form, request.server.methods.getFormService())
  request.app.model = { def: definition }
}
