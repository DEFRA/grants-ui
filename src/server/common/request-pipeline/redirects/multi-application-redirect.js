import { notFound } from '@hapi/boom'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../../helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../../helpers/grant-code.js'
import { getStateWithDefinition } from '../../helpers/state/state-with-definition-context.js'
import { listApplicationsFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { setApplicationInSession, clearApplicationFromSession } from '../../helpers/state/get-cache-key-helper.js'
import { SLUG_ROOT_ROUTE } from './service-root-redirect.js'

/**
 * Resolves `?ref=` routing for an SBI with more than one application for a
 * grant (0/1/2+ routing table from the ticket's dev notes). Runs from
 * `onPostAuth`, before the forms-engine-plugin's own state load, which would
 * otherwise silently create a blank application for an invalid `?ref=`.
 *
 * The no-ref application-count check only runs at the root route: every
 * other page is already inside a journey, so there's nothing to resolve.
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
    // No ref needed: the backend already finds the SBI's one application
    // unaided. Storing it would only risk going stale later and silently
    // breaking status updates.
    clearApplicationFromSession(request)
    return h.continue
  }

  // make sure we drop any stale referenceNumbers from session data
  clearApplicationFromSession(request)
  return h.redirect(`/${slug}/applications`).takeover()
}
