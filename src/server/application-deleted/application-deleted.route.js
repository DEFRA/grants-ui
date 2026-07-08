import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'

/**
 * @satisfies {ServerRoute}
 */
export const applicationDeletedRoute = {
  method: 'GET',
  path: '/{slug}/application-deleted',
  handler: async (request, h) => {
    const cacheService = getFormsCacheService(request.server)
    const state = await cacheService.getState(request)

    if (state?.applicationStatus === 'PURGED') {
      await cacheService.clearState(
        /** @type {import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} */ (
          /** @type {unknown} */ (request)
        ),
        true
      )
    }

    return h.view('application-deleted', {
      slug: request.params.slug,
      pageTitle: 'Your draft application has been deleted'
    })
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
