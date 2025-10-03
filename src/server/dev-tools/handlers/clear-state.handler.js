import { config } from '~/src/config/config.js'
import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'
import { getCacheKey } from '../../common/helpers/state/get-cache-key-helper.js'

/**
 * Clears the current application state
 * @param {object} request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {object} Hapi response
 */
export async function clearStateHandler(request, h) {
  const cacheService = getFormsCacheService(request.server)

  try {
    const { sbi, grantCode } = getCacheKey(request)
    const isProduction = config.get('isProduction')
    if (!isProduction && sbi && grantCode) {
      await cacheService.clearState(request, true)
    }
  } catch (e) {}
  // const url = request.url.pathname + request.url.search
  // return h.redirect(url)

  const referer = request.headers.referer || request.headers.referrer
  return h.redirect(referer || '/')
}
