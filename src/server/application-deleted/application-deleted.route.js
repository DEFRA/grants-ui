import { ApplicationStatus } from '../common/constants/application-status.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { getApplicationRef, setApplicationRef } from '../common/helpers/state/get-cache-key-helper.js'

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
export const applicationDeletedGetRoute = {
  method: 'GET',
  path: '/{slug}/application-deleted',
  handler: async (request, h) => {
    try {
      const cacheService = getFormsCacheService(request.server)
      const state = await cacheService.getState(request)

      if (state?.applicationStatus === ApplicationStatus.PURGED) {
        // A ref-keyed application must keep its `$$__referenceNumber` (the backend
        // rejects a save without it); a single-application grant drops it as before.
        // eslint-disable-next-line camelcase
        const $$__referenceNumber = getApplicationRef(request) ? state.$$__referenceNumber : undefined

        await cacheService.setState(
          /** @type {import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} */ (
            /** @type {unknown} */ (request)
          ),
          {
            applicationStatus: ApplicationStatus.PURGED,
            // eslint-disable-next-line camelcase
            ...($$__referenceNumber && { $$__referenceNumber })
          }
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
 * @satisfies {ServerRoute}
 */
export const applicationDeletedPostRoute = {
  method: 'POST',
  path: '/{slug}/application-deleted',
  handler: async (request, h) => {
    const cacheService = getFormsCacheService(request.server)

    await cacheService.clearState(
      /** @type {import('@defra/forms-engine-plugin/types').AnyFormRequest} */ (/** @type {unknown} */ (request)),
      true
    )

    // The application no longer exists: its ref must not be put back on the redirect.
    setApplicationRef(request, undefined)

    return h.redirect(`/${request.params.slug}`)
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
