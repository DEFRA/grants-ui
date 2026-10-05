import { notFound } from '@hapi/boom'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../../helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../../helpers/grant-code.js'
import { getStateWithDefinition } from '../../helpers/state/state-with-definition-context.js'
import { listApplicationsFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { getCacheKey, persistApplication, clearPersistedApplication } from '../../helpers/state/get-cache-key-helper.js'
import { SLUG_ROOT_ROUTE } from '../../constants/routes.js'

/**
 * @param {import('../../helpers/state/fetch-saved-state-helper.js').StateWithDefinitionEnvelope | null | undefined} stateWithDef
 * @returns {boolean}
 */
function resolveAllowMultipleApplications(stateWithDef) {
  return (
    stateWithDef?.definition?.allowMultipleApplications === true ||
    stateWithDef?.state?.allowMultipleApplications === true
  )
}

/**
 * Resolves `?ref=` routing for grants that allow multiple applications per SBI.
 *
 * Runs from the `onPostAuth` server extension, before the forms-engine-plugin
 * loads any state: `page.getState` (called later, inside the plugin's route
 * handler) silently creates a brand-new blank application - with a freshly
 * generated reference number - whenever it finds no existing state. Validating
 * `ref` here, before that call, is what turns "no state found for this ref"
 * into a 404 instead of an invisible new application.
 *
 * Single-application schemes (no `allowMultipleApplications` on the grant's
 * definition) are intended to be completely unaffected by this feature:
 * nothing is ever persisted to session for them (`getCacheKey` itself never
 * writes - only this function does, and only past the flag check below), so
 * no `applicationRef` is ever added to a later backend call that did not
 * already carry one. The one unavoidable exception is the
 * definition-resolving backend call below (`getStateWithDefinition`) itself:
 * the engine's own model resolution already goes through this same call for
 * every request (see `resolveBackendDefinition`), scoped by whatever `?ref=`
 * happens to be on the URL - harmless for a single-application grant, since
 * that scheme's saved state never has an `applicationRef` to match against,
 * so the lookup behaves exactly as it would with no ref at all.
 *
 * Routing (see the ticket's dev notes), for `allowMultipleApplications: true`
 * grants only:
 * - `ref` present -> a missing state result means the ref does not exist or
 *   belongs to another business (both are indistinguishable, and both are a
 *   404 - the lookup is always scoped to the authenticated sbi). The ref is
 *   persisted to session here so it survives the forms-engine-plugin
 *   stripping the query string on later POSTs and on its own internal
 *   redirects (e.g. a submitted application's relevant path is
 *   `/confirmation`, not the entry page, and that redirect carries no query
 *   string at all - see `page.getHref`/`proceed` in the engine).
 *   `?ref=` therefore stays visible in the address bar on a page reached
 *   this way (e.g. an in-progress application's `/start`, whose relevant
 *   path is the root itself, so the engine never redirects at all) even
 *   though it never appears on a page reached via one of the engine's own
 *   redirects - an accepted cosmetic inconsistency, not a correctness one.
 * - No `ref`, on a sub-page (`/{slug}/{path}/{itemId?}`), and a ref is
 *   already persisted to session for this grant -> that ref was resolved on
 *   the `/{slug}` request that led here (the engine only ever redirects AWAY
 *   from the root, never back onto it, so a ref-less sub-page request can
 *   only mean the engine stripped it mid-journey); trust it and continue
 *   rather than re-counting applications.
 * - No `ref` otherwise (always on `/{slug}` itself, or a sub-page with
 *   nothing persisted) -> re-evaluate from the actual application count,
 *   since the root is the one place a user can land on directly (typed,
 *   bookmarked, clicked) and a stale persisted ref must never silently
 *   override that:
 *   - 0 applications -> start new (unchanged); clear any stale persisted ref.
 *   - 1 application -> pin its ref as the active one for this grant, exactly
 *     as if `?ref=` had been supplied, so the rest of the journey resolves
 *     consistently even if a second application appears later in the
 *     session.
 *   - 2+ applications -> redirect to the stub application selector, which
 *     clears the persisted ref itself (landing there means "which
 *     application this is" is no longer known).
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {Promise<symbol | import('@hapi/hapi').ResponseObject>}
 */
export async function multiApplicationRedirect(request, h) {
  const ref = /** @type {string | undefined} */ (request.query?.ref)

  const stateWithDef = await getStateWithDefinition(request)
  const allowMultipleApplications = resolveAllowMultipleApplications(stateWithDef)

  if (!allowMultipleApplications) {
    return h.continue
  }

  if (ref) {
    if (!stateWithDef?.state) {
      throw notFound('Unknown application reference')
    }
    persistApplication(request, getGrantCode(request), ref)
    return h.continue
  }

  const slug = request.params.slug
  const isRootRequest = request.route?.path === SLUG_ROOT_ROUTE
  if (!isRootRequest && getCacheKey(request).applicationRef) {
    return h.continue
  }

  const crn = getAuthenticatedCrn(request)
  const sbi = getAuthenticatedSbi(request)
  const grantCode = getGrantCode(request)
  const applications = await listApplicationsFromApi({ crn, sbi, grantCode })

  if (applications.length === 0) {
    clearPersistedApplication(request)
    return h.continue
  }

  if (applications.length === 1) {
    persistApplication(request, grantCode, applications[0].applicationRef)
    return h.continue
  }

  return h.redirect(`/${slug}/applications`).takeover()
}
