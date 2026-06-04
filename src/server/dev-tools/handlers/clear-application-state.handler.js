import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'
import { SessionError } from '~/src/server/common/utils/errors/SessionError.js'
import { findFormBySlug, loadFormDefinition } from '~/src/server/common/forms/services/find-form-by-slug.js'
import { clearParcelCache } from '~/src/server/land-grants/services/parcel-cache.js'
import { clearSavedStateFromApi } from '~/src/server/common/helpers/state/fetch-saved-state-helper.js'
import { mintLockToken } from '~/src/server/common/helpers/lock/lock-token.js'
import { YarKeys } from '~/src/server/common/constants/session-keys.js'
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
  try {
    await cacheService.clearState(request, true)
  } catch (error) {
    const sessionKey = cacheService._Key(request)
    const sessionError = new SessionError({
      message: 'Session state clear failed',
      source: 'clearApplicationStateHandler',
      reason: 'session_state_clear_failure',
      slug,
      sessionKey
    })
    throw sessionError.from(/** @type {Error} */ (error))
  }
}

/**
 * @param {ClearStateRequest} request
 */
async function clearStateWithoutSlug(request) {
  const credentials = /** @type {{ sbi?: string, contactId?: string }} */ (request.auth?.credentials)
  const sbi = credentials?.sbi
  const contactId = credentials?.contactId
  const { grantCode } = /** @type {{ grantCode: string | undefined }} */ (
    request.yar?.get(YarKeys.GRANT_APPLICATION_CONTEXT) || {}
  )

  if (!sbi || !grantCode || !contactId) {
    return
  }

  const grantVersion =
    /** @type {{ metadata?: { version?: string | number } }} */ (request.app.model?.def)?.metadata?.version ?? 1
  const lockToken = mintLockToken({ userId: String(contactId), sbi, grantCode, grantVersion })

  let clearError
  try {
    await clearSavedStateFromApi(`${sbi}:${grantCode}`, request, { lockToken })
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
