import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'

/**
 * Clears the current application state
 * @param {object} request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {object} Hapi response
 */
export async function clearApplicationStateHandler(request, h) {
  const slug = request.params?.slug || ''

  // we need a slug to clear the persisted state
  if (slug) {
    const cacheService = getFormsCacheService(request.server)
    await cacheService.clearState(request, true)
  }

  return h.redirect(`/${slug}`)
}
