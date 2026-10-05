import { notFound } from '@hapi/boom'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../../helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../../helpers/grant-code.js'
import { getStateWithDefinition } from '../../helpers/state/state-with-definition-context.js'
import { listApplicationsFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { setApplicationInSession, clearApplicationFromSession } from '../../helpers/state/get-cache-key-helper.js'
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
 * The count check (`listApplicationsFromApi`) only runs for the root route -
 * it's the sole entry point where "which application is this?" is still an
 * open question. Every other page is already inside a specific journey, so
 * it just continues: re-running the count there would be a wasted backend
 * call on every page, and could stamp an unrelated application's ref into
 * session mid-journey if the SBI's application count changed since entry.
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
    setApplicationInSession(request, ref)

    // Root redirects to the journey start on its own; elsewhere, strip `?ref=`
    // from the address bar ourselves now that it's safely in session.
    if (isRootRequest) {
      return h.continue
    }
    return h.redirect(request.path).takeover()
  }

  if (!isRootRequest) {
    return h.continue
  }

  const slug = request.params.slug
  const crn = getAuthenticatedCrn(request)
  const sbi = getAuthenticatedSbi(request)
  const grantCode = getGrantCode(request)
  const applications = await listApplicationsFromApi({ crn, sbi, grantCode })

  if (applications.length <= 1) {
    // 0 or 1 application resolves correctly without a ref at all - the
    // backend's own lookup falls back to the SBI's one and only document
    // when no ref is given. Storing one here would be pure risk with no
    // benefit: if it ever went stale (e.g. after a later reference-number
    // change) it would silently stop matching anything, breaking status
    // updates for every grant, not just multi-application ones.
    clearApplicationFromSession(request)
    return h.continue
  }

  // make sure we drop any stale referenceNumbers from session data
  clearApplicationFromSession(request)
  return h.redirect(`/${slug}/applications`).takeover()
}
