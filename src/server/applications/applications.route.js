import { getAuthenticatedCrn, getAuthenticatedSbi } from '../common/helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../common/helpers/grant-code.js'
import { listApplicationsFromApi } from '../common/helpers/state/fetch-saved-state-helper.js'
import { clearApplicationFromSession } from '../common/helpers/state/get-cache-key-helper.js'

/**
 * Landing page shown when an SBI holds more than one application for a
 * multi-application grant and no `?ref=` was given to pick between them.
 * @satisfies {ServerRoute}
 */
export const listApplicationsRoute = {
  method: 'GET',
  path: '/{slug}/applications',
  handler: async (request, h) => {
    clearApplicationFromSession(request)

    const crn = getAuthenticatedCrn(request)
    const sbi = getAuthenticatedSbi(request)
    const grantCode = getGrantCode(request)
    const applications = await listApplicationsFromApi({ crn, sbi, grantCode })

    return h.view('applications', {
      pageTitle: 'Your applications',
      slug: request.params.slug,
      applications
    })
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
