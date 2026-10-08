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
  const stateWithDef = await getStateWithDefinition(request)

  if (!ref && request.query?.ref) {
    // Present but not a reference number: unknown on a multi-application grant, ignored on a
    // single-application one like any other stray parameter.
    if (isMultiApplication(stateWithDef)) {
      throw notFound('Unknown application reference')
    }
    return ignoreReference(request, h)
  }

  return ref ? resolveWithRef(request, h, stateWithDef) : resolveWithoutRef(request, h, stateWithDef)
}

/**
 * Single-application scheme: drop the ref and carry on (a POST keeps its payload).
 *
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 */
function ignoreReference(request, h) {
  setReferenceNumber(request, undefined)
  return request.method === 'get' ? h.redirect(currentUrl(request)).takeover() : h.continue
}

/**
 * Flag on, or documents the backend keys by reference (it marks them: flagged grant, or an SBI
 * already holding several). A grant that just turned the flag off stays multi-application until
 * its documents are next saved, when the backend re-keys and re-marks them - that is the accurate view.
 *
 * @param {StateWithDefinitionEnvelope | null} envelope
 * @returns {boolean}
 */
function isMultiApplication(envelope) {
  return allowsMultipleApplications(envelope) || envelope?.state?.allowMultipleApplications === true
}

/**
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @param {StateWithDefinitionEnvelope | null} envelope
 */
async function resolveWithRef(request, h, envelope) {
  if (isMultiApplication(envelope)) {
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
  return ignoreReference(request, h)
}

/**
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @param {StateWithDefinitionEnvelope | null} envelope - the backend's unscoped pick
 */
async function resolveWithoutRef(request, h, envelope) {
  // Single-application scheme: exactly as before, no applications lookup.
  if (!(isMultiApplication(envelope))) {
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
