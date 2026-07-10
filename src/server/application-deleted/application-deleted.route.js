import { ApplicationStatus } from '../common/constants/application-status.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'

function logStateClearFailure(request, err) {
  log(
    LogCodes.PURGE.STATE_CLEAR_FAILURE,
    {
      slug: request.params.slug,
      errorMessage: err instanceof Error ? err.message : String(err)
    },
    request
  )
}

/**
 * @satisfies {ServerRoute}
 */
export const applicationDeletedRoute = {
  method: 'GET',
  path: '/{slug}/application-deleted',
  handler: async (request, h) => {
    try {
      const cacheService = getFormsCacheService(request.server)
      const state = await cacheService.getState(request)

      if (state?.applicationStatus === ApplicationStatus.PURGED) {
        await cacheService.clearState(
          /** @type {import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} */ (
            /** @type {unknown} */ (request)
          ),
          true
        )

        log(
          LogCodes.PURGE.STATE_CLEAR_SUCCESS,
          {
            slug: request.params.slug
          },
          request
        )
      }
    } catch (err) {
      logStateClearFailure(request, err)
    }

    return h.view('application-deleted', {
      text: 'Return to summary',
      pageTitle: 'Your draft application has been deleted',
      href: `/${request.params.slug}`
    })
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
