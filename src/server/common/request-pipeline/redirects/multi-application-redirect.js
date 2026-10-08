import { notFound } from '@hapi/boom'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../../helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../../helpers/grant-code.js'
import { getReferenceNumber, setReferenceNumber } from '../../helpers/state/get-cache-key-helper.js'
import { getStateWithDefinition } from '../../helpers/state/state-with-definition-context.js'
import { listApplicationsFromApi } from '../../helpers/state/fetch-saved-state-helper.js'

/**
 * `?ref=` routing (onPostAuth, before the plugin loads state). A grant is
 * multi-application when its definition is flagged or the backend already
 * stores the SBI's documents keyed by ref (`allowMultipleApplications` on the doc). With a ref it must resolve (404 otherwise; a
 * single-application grant just drops it). Without one: 0 continue, 1 attach its ref, 2+ selector.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {Promise<symbol | import('@hapi/hapi').ResponseObject>}
 */
export async function multiApplicationRedirect(request, h) {
  if (request.path === applicationsSelectorPath(request)) {
    return h.continue
  }

  const ref = getReferenceNumber(request)

  if (!ref && request.query?.ref) {
    // Present but not a reference number: nothing to look up.
    throw notFound('Unknown application reference')
  }

  const envelope = await getStateWithDefinition(request)

  return ref ? resolveWithRef(request, h, envelope) : resolveWithoutRef(request, h, envelope)
}

/**
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @param {StateWithDefinitionEnvelope | null} envelope
 */
async function resolveWithRef(request, h, envelope) {
  const storedByReference = allowsMultipleApplications(envelope) || envelope?.state?.allowMultipleApplications === true

  if (storedByReference) {
    if (!envelope?.state) {
      throw notFound('Unknown application reference')
    }
    return h.continue
  }

  // Not flagged and no ref-keyed document for this ref: single-application scheme, unless
  // the SBI already holds several (keyed by ref by the backend), in which case the ref is simply unknown.
  if (!envelope?.state && (await listApplications(request)).length > 1) {
    throw notFound('Unknown application reference')
  }

  // Single-application scheme: a stray ref is ignored, even one matching its only document.
  setReferenceNumber(request, undefined)
  return request.method === 'get' ? h.redirect(currentUrl(request)).takeover() : h.continue
}

/**
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @param {StateWithDefinitionEnvelope | null} envelope - the backend's unscoped pick
 */
async function resolveWithoutRef(request, h, envelope) {
  // The backend marks every document it keys by reference (flagged grant, or an SBI that already
  // holds several), so the marker catches the unflagged-but-several case without a lookup here.
  const isMultiApplication = allowsMultipleApplications(envelope) || envelope?.state?.allowMultipleApplications === true

  // Single-application scheme: exactly as before, no applications lookup.
  if (!isMultiApplication) {
    return h.continue
  }

  const applications = await listApplications(request)

  if (applications.length > 1) {
    return h.redirect(applicationsSelectorPath(request)).takeover()
  }

  // Documents are keyed by reference, so even the sole application must be named on every request.
  if (applications.length === 1) {
    return scopeToApplication(request, h, applications[0].applicationRef)
  }

  // No live application: the forms engine creates one on this request and the next request picks up
  // its ref. The unscoped read may still have found a purged document (the list hides those); forget it.
  if (envelope?.state) {
    const app = /** @type {{ stateWithDefinition?: Promise<StateWithDefinitionEnvelope | null> }} */ (request.app)
    app.stateWithDefinition = Promise.resolve({ ...envelope, state: null })
  }
  return h.continue
}

/**
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @param {string} applicationRef
 */
function scopeToApplication(request, h, applicationRef) {
  // Scoped for the rest of this request too (later redirect producers read the ref from it).
  setReferenceNumber(request, applicationRef)

  return request.method === 'get' ? h.redirect(currentUrl(request, applicationRef)).takeover() : h.continue
}

/**
 * @param {AnyRequest} request
 * @returns {string}
 */
function applicationsSelectorPath(request) {
  return `/${request.params.slug}/applications`
}

/**
 * @param {StateWithDefinitionEnvelope | null | undefined} envelope
 * @returns {boolean}
 */
function allowsMultipleApplications(envelope) {
  const definition = envelope?.definition

  return (
    definition?.allowMultipleApplications === true ||
    definition?.definition?.metadata?.allowMultipleApplications === true
  )
}

/**
 * @param {AnyRequest} request
 */
function listApplications(request) {
  return listApplicationsFromApi({
    crn: getAuthenticatedCrn(request),
    sbi: getAuthenticatedSbi(request),
    grantCode: getGrantCode(request)
  })
}

/**
 * The request's own URL, with the ref replaced (or removed).
 *
 * @param {AnyRequest} request
 * @param {string} [ref]
 * @returns {string}
 */
function currentUrl(request, ref) {
  const params = new URLSearchParams(request.url.search)
  params.delete('ref')

  if (ref) {
    params.set('ref', ref)
  }

  const query = params.toString()

  return query ? `${request.path}?${query}` : request.path
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseToolkit } from '@hapi/hapi'
 * @import { StateWithDefinitionEnvelope } from '../../helpers/state/fetch-saved-state-helper.js'
 */
