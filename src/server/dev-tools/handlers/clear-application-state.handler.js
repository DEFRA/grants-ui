import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

/**
 * Clears the current application state
 * @param {object} request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {Promise<Response>} Hapi response
 */
export async function clearApplicationStateHandler(request, h) {
  const slug = request.params?.slug || ''

  // we need a slug to clear the persisted state
  if (slug) {
    const cacheService = getFormsCacheService(request.server)
    let sessionKey = 'unknown'
    try {
      await cacheService.clearState(request, true)
    } catch (error) {
      sessionKey = cacheService._Key(request)
      log(
        LogCodes.SYSTEM.SESSION_STATE_CLEAR_FAILED,
        {
          slug,
          sessionKey,
          errorMessage: error.message
        },
        request
      )

      throw error
    }
  }

  return h.redirect(`/${slug}`)
}
