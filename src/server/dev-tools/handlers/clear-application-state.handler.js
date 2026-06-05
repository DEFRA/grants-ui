import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'
import { findFormBySlug, loadFormDefinition } from '~/src/server/common/forms/services/find-form-by-slug.js'
import { clearParcelCache } from '~/src/server/land-grants/services/parcel-cache.js'
import { clearSavedStateFromApiByContext } from '~/src/server/common/helpers/state/fetch-saved-state-helper.js'
import { mintLockToken } from '~/src/server/common/helpers/lock/lock-token.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { YarKeys } from '~/src/server/common/constants/session-keys.js'

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
    clearError = /** @type {Error} */ (error)
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
  const grantApplicationContext = /** @type {{ grantCode?: string, grantVersion?: string | number } | null} */ (
    request.yar?.get(YarKeys.GRANT_APPLICATION_CONTEXT)
  )
  const grantCode = grantApplicationContext?.grantCode
  const grantVersion = grantApplicationContext?.grantVersion ?? 1

  if (!sbi || !grantCode || !contactId) {
    log(LogCodes.SYSTEM.SERVER_ERROR, { errorMessage: `clearStateWithoutSlug: missing required values — sbi=${sbi}, grantCode=${grantCode}, contactId=${contactId}` }, request)
    return
  }

  const lockToken = mintLockToken({ userId: String(contactId), sbi, grantCode, grantVersion })

  let clearError
  try {
    await clearSavedStateFromApiByContext({ sbi, grantCode, grantVersion, lockToken })
  } catch (err) {
    clearError = /** @type {Error} */ (err)
  }

  if (clearError) {
    log(LogCodes.SYSTEM.SERVER_ERROR, { errorMessage: clearError.message }, request)
  }
}

const loadFormAndSetOnRequestModel = async (form, request) => {
  const definition = await loadFormDefinition(form, request.server.methods.getFormService())
  request.app.model = { def: definition }
}
