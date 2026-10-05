import { notFound } from '@hapi/boom'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../../helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../../helpers/grant-code.js'
import { getStateWithDefinition } from '../../helpers/state/state-with-definition-context.js'
import { listApplicationsFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { getCacheKey, storeApplicationInSession, clearApplicationFromSession } from '../../helpers/state/get-cache-key-helper.js'
import { SLUG_ROOT_ROUTE } from '../../constants/routes.js'

/**
 * Resolves `?ref=` routing for an SBI that holds more than one application
 * for a grant (see the ticket's dev notes for the 0/1/2+ routing table).
 *
 * Runs from `onPostAuth`, before the forms-engine-plugin loads state: its
 * `page.getState` silently creates a new blank application whenever it finds
 * none, so an invalid `?ref=` must be rejected here first.
 *
 * Branches on the real application count rather than the grant's
 * `allowMultipleApplications` flag: the flag is only resolvable once an
 * application is already picked (it's scoped per `pinnedMajor`), which is
 * circular when no ref is given yet - exactly this function's job to decide.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {Promise<symbol | import('@hapi/hapi').ResponseObject>}
 */
export async function multiApplicationRedirect(request, h) {
  const ref = /** @type {string | undefined} */ (request.query?.ref)
  const isRootRequest = request.route?.path === SLUG_ROOT_ROUTE

  if (ref) {
    const stateWithDef = await getStateWithDefinition(request)
    if (!stateWithDef?.state) {
      throw notFound('Unknown application reference')
    }
    storeApplicationInSession(request, getGrantCode(request), ref)

    // The ref is now in session, so we no longer need it on the URL. The
    // root route already redirects to the start of the journey on its own;
    // elsewhere we redirect ourselves to drop `?ref=` from the address bar.
    if (isRootRequest) {
      return h.continue
    }
    return h.redirect(request.path).takeover()
  }

  const slug = request.params.slug

  if (!isRootRequest && getCacheKey(request).applicationRef) {
    return h.continue
  }

  const crn = getAuthenticatedCrn(request)
  const sbi = getAuthenticatedSbi(request)
  const grantCode = getGrantCode(request)
  const applications = await listApplicationsFromApi({ crn, sbi, grantCode })

  if (applications.length === 0) {
    clearApplicationFromSession(request)
    return h.continue
  }

  if (applications.length === 1) {
    storeApplicationInSession(request, grantCode, applications[0].applicationRef)
    return h.continue
  }

  return h.redirect(`/${slug}/applications`).takeover()
}
