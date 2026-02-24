import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'
import { SessionError } from '~/src/server/common/utils/errors/SessionError.js'

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
      const sessionError = new SessionError({
        message: 'Session state clear failed',
        source: 'clearApplicationStateHandler',
        reason: 'session_state_clear_failure',
        slug,
        sessionKey
      })
      throw sessionError.from(error)
    }
  }

  return h.redirect(`/${slug}`)
}
